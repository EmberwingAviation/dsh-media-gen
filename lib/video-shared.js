/** Values shared by the Host and browser Bundle faces. */

/** Browser route that streams a generated video file back to the result card. */
export const VIDEO_ROUTE = "/plugins/dsh-video-gen/video";
/** Namespace persisted through DSH Settings. */
export const VIDEO_GENERATION_NAMESPACE = "video-generation";

/** Supported providers. */
export const VIDEO_PROVIDERS = ["dashscope", "volcengine", "openai", "google"];
/** Supported image-to-video providers. */
export const ANIMATE_PROVIDERS = ["dashscope", "volcengine", "google"];

/** Default endpoints / base URLs. */
export const DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
export const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Default model names. */
export const DEFAULT_DASHSCOPE_MODEL = "wanx2.1-t2v-turbo";
export const DEFAULT_VOLCENGINE_MODEL = "doubao-seedance-1-0-pro-250528";
export const DEFAULT_OPENAI_MODEL = "sora-2";
export const DEFAULT_GOOGLE_MODEL = "veo-3.0-generate-preview";

/** Credential reference env-var names, one per provider. */
export const DASHSCOPE_API_KEY_ENV = "DASHSCOPE_API_KEY";
export const VOLCENGINE_API_KEY_ENV = "ARK_API_KEY";
export const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
export const GOOGLE_API_KEY_ENV = "GEMINI_API_KEY";

/** Default workspace subfolder that receives generated video files (与生图 generate/image 对称). */
export const DEFAULT_WORKSPACE_FOLDER = "generate/video";

/** Hard ceiling for a downloaded video file (bytes). Protects host memory. */
export const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const ERROR_LIMIT = 4096;

/** Sleep that rejects promptly when the caller aborts. */
export function delay(ms, signal) {
	return new Promise((resolveDelay, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("aborted"));
			return;
		}
		const timer = setTimeout(resolveDelay, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(signal.reason ?? new Error("aborted"));
		}, { once: true });
	});
}

/** Read a response body as text, bounded so a hostile endpoint cannot exhaust memory. */
export async function readBoundedText(response, maxBytes, _label) {
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error(`response exceeded the ${String(maxBytes)} byte limit`);
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	return new TextDecoder().decode(concatChunks(chunks, bytes));
}

/** Read a response body as bytes, bounded by maxBytes. */
export async function readBoundedBytes(response, maxBytes) {
	if (response.body === null) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error(`video (${String(bytes)}+ bytes) exceeds the ${String(maxBytes)} byte limit`);
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	return concatChunks(chunks, bytes);
}

function concatChunks(chunks, bytes) {
	const joined = new Uint8Array(bytes);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return joined;
}

/** Video media type inferred from a content-type header, defaulting to mp4. */
export function videoMediaType(value) {
	const mt = value?.split(";", 1)[0]?.trim().toLowerCase();
	if (mt === "video/mp4" || mt === "video/webm" || mt === "video/quicktime") return mt;
	return "video/mp4";
}

/** Download a video URL into memory as bytes plus its media type. */
export async function downloadVideo(url, { maxBytes, signal }) {
	const response = await fetch(url, { redirect: "follow", ...(signal ? { signal } : {}) });
	if (!response.ok) throw new Error(`video download failed (${String(response.status)})`);
	const data = await readBoundedBytes(response, maxBytes);
	return { data, mediaType: videoMediaType(response.headers.get("content-type")) };
}