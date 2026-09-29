/** Resolve a reference image for image-to-video (animate_image) requests. */
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Resolve and read the reference image for animate_image.
 *
 * Three ways in, in priority order: an explicit workspace `sourcePath`; an
 * explicit `sourceAttachmentId` naming an image the conversation carries; and,
 * with neither given, the newest conversation image (what the tool description
 * promises). Conversation images arrive as the harness's own attachment refs —
 * this module never touches attachment storage itself, it hands the ref back to
 * the caller's `readImage`.
 */
export async function resolveReferenceImage(input) {
	if (input.sourceAttachmentId !== undefined && input.sourcePath !== undefined) {
		throw new Error("animate_image accepts either source_attachment_id or source_path, not both");
	}

	if (input.sourcePath !== undefined) {
		return readWorkspaceReferenceImage({
			sourcePath: input.sourcePath,
			workspaceRoot: input.workspaceRoot,
			maxBytes: input.maxBytes,
			signal: input.signal,
		});
	}

	if (input.sourceAttachmentId !== undefined) {
		const named = findConversationImage(input.conversationImages ?? [], input.sourceAttachmentId);
		if (named === undefined) {
			throw new Error(`animate_image could not find image attachment ${input.sourceAttachmentId} in the current conversation`);
		}
		return readConversationImage(input, named, input.sourceAttachmentId);
	}

	const newest = (input.conversationImages ?? []).at(-1);
	if (newest === undefined) return undefined;
	return readConversationImage(input, newest, undefined);
}

/** Read one conversation image through the injected attachment store. */
async function readConversationImage(input, ref, label) {
	if (input.readImage === undefined) {
		throw new Error("animate_image requires an image attachment store to resolve source_attachment_id");
	}
	try {
		const stored = await input.readImage(ref, input.signal);
		if (stored?.data === undefined) {
			throw new Error("the attachment store returned no image data");
		}
		return {
			data: stored.data instanceof Uint8Array ? stored.data : new Uint8Array(stored.data),
			mediaType: stored.mediaType ?? "image/png",
		};
	} catch (error) {
		const named = label === undefined ? "the newest conversation image" : `image attachment ${label}`;
		throw new Error(`animate_image could not read ${named}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Find an image the model referred to. The harness may surface either the raw
 * attachment id or its sha256 digest, so both forms are matched.
 */
function findConversationImage(refs, requested) {
	for (let index = refs.length - 1; index >= 0; index -= 1) {
		const ref = refs[index];
		if (ref !== undefined && String(ref.attachmentId) === requested) return ref;
	}
	const requestedDigest = sha256Digest(requested);
	if (requestedDigest === undefined) return undefined;
	for (let index = refs.length - 1; index >= 0; index -= 1) {
		const ref = refs[index];
		if (ref !== undefined && sha256Digest(String(ref.attachmentId)) === requestedDigest) return ref;
	}
	return undefined;
}

/** The 64-hex sha256 a harness may use in place of a raw attachment id. */
function sha256Digest(value) {
	return /^(?:sha256:)?([0-9a-f]{64})$/i.exec(value.trim())?.[1]?.toLowerCase();
}

/**
 * Read an explicitly named workspace image without exposing filesystem details.
 * Both lexical and real-path containment are enforced.
 */
async function readWorkspaceReferenceImage(input) {
	const requested = input.sourcePath.trim();
	if (requested.length === 0) throw new Error("animate_image source_path must not be empty");
	if (input.workspaceRoot === undefined) {
		throw new Error("animate_image source_path requires an active DSH session workspace");
	}

	const root = resolve(input.workspaceRoot);
	const candidate = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
	if (!containsPath(root, candidate)) {
		throw new Error("animate_image source_path must stay inside the session workspace: " + requested);
	}

	let realRoot;
	let realCandidate;
	try {
		[realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new Error("animate_image could not find workspace image: " + requested);
		}
		throw error;
	}
	if (!containsPath(realRoot, realCandidate)) {
		throw new Error("animate_image source_path resolves outside the session workspace: " + requested);
	}

	const file = await stat(realCandidate);
	if (!file.isFile()) throw new Error("animate_image source_path is not a file: " + requested);
	if (input.maxBytes !== undefined && file.size > input.maxBytes) {
		throw new Error("animate_image source image is too large (" + String(file.size) + " bytes; maximum " + String(input.maxBytes) + ")");
	}

	const data = await readFile(realCandidate, { signal: input.signal });
	const mediaType = detectImageMediaType(new Uint8Array(data));
	if (mediaType === undefined) {
		throw new Error("animate_image source_path is not a supported PNG, JPEG, WebP, or GIF image: " + requested);
	}
	return { data: new Uint8Array(data), mediaType };
}

function detectImageMediaType(data) {
	if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") return "image/gif";
	if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
	return undefined;
}

function startsWith(data, signature) {
	return signature.every((byte, index) => data[index] === byte);
}

function ascii(data, offset, length) {
	return String.fromCharCode(...data.subarray(offset, offset + length));
}

function containsPath(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}