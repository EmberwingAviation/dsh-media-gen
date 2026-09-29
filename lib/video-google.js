/** Google Veo video generation adapter (Gemini Interactions API). */
import { readBoundedText, readBoundedBytes } from "./video-shared.js";
import { retryOnRateLimit, tagRateLimit } from "./rate-limit.js";

const ERROR_LIMIT = 4096;
const REQUESTED_MEDIA_TYPE = "video/mp4";

/**
 * Generate a video from a text prompt via Google Veo.
 * Docs: POST {endpoint} with model veo-3.0-generate-preview
 *       response_format: { type: "video", mime_type: "video/mp4" }
 */
export async function generateGoogleVideo(input) {
	return requestVeoVideo({
		...input,
		operation: "generation",
	});
}

/**
 * Generate a video from a reference image + text prompt via Google Veo.
 * The input includes the source image as base64 alongside the text prompt.
 */
export async function animateGoogleVideo(input) {
	const { data, mediaType } = input.sourceImage;
	return requestVeoVideo({
		...input,
		operation: "image-to-video",
		extraInput: [
			{ type: "image", mime_type: mediaType, data: Buffer.from(data).toString("base64") },
		],
	});
}

/**
 * Shared Veo request, response parsing, and size enforcement.
 * Uses the Gemini Interactions API with video response_format.
 */
async function requestVeoVideo(input) {
	const label = `Google Veo video ${input.operation}`;

	const interactionInput = input.extraInput && input.extraInput.length > 0
		? [
			{ type: "text", text: input.prompt },
			...input.extraInput,
		]
		: input.prompt;

	const text = await retryOnRateLimit(async () => {
		const response = await fetch(input.endpoint, {
			method: "POST",
			redirect: "error",
			signal: input.signal,
			headers: {
				"content-type": "application/json",
				"x-goog-api-key": input.apiKey,
			},
			body: JSON.stringify({
				model: input.model,
				input: interactionInput,
				response_format: {
					type: "video",
					mime_type: REQUESTED_MEDIA_TYPE,
				},
			}),
		});
		const body = await readBoundedText(response, Math.ceil(input.maxBytes * 1.4) + ERROR_LIMIT, label);
		if (!response.ok) {
			let parsed;
			try { parsed = JSON.parse(body); } catch { parsed = undefined; }
			throw tagRateLimit(new Error(`${label} failed (${String(response.status)}): ${body.slice(0, ERROR_LIMIT)}`), { status: response.status, payload: parsed });
		}
		return body;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label });

	let payload;
	try {
		payload = JSON.parse(text);
	} catch {
		throw new Error(`${label} returned invalid JSON`);
	}

	// Parse the video response from the Interactions API.
	// The output may be in output_video or steps[].content[].
	const video = extractVideo(payload);
	if (video === undefined) {
		throw new Error(`${label} returned no video: ${text.slice(0, ERROR_LIMIT)}`);
	}

	const mediaType = videoMediaType(video.mime_type ?? REQUESTED_MEDIA_TYPE);
	if (mediaType === undefined) {
		throw new Error(`${label} returned unsupported media type ${JSON.stringify(video.mime_type)}`);
	}

	const data = decodeBase64(video.data, label);
	if (data.byteLength > input.maxBytes) {
		throw new Error(`${label} exceeded the ${String(input.maxBytes)} byte video limit`);
	}

	return { data, mediaType };
}

/** Walk the Interactions API response to find the output video. */
function extractVideo(value) {
	const interaction = record(value);
	if (interaction === undefined) return undefined;

	// Direct output_video
	const direct = videoContent(interaction.output_video, false);
	if (direct !== undefined) return direct;

	// Steps-based response (model_output containing video)
	if (!Array.isArray(interaction.steps)) return undefined;
	for (const step of interaction.steps) {
		const modelOutput = record(step);
		if (modelOutput?.type !== "model_output" || !Array.isArray(modelOutput.content)) continue;
		for (const content of modelOutput.content) {
			const video = videoContent(content, true);
			if (video !== undefined) return video;
		}
	}
	return undefined;
}

function videoContent(value, requiresVideoType) {
	const video = record(value);
	if (video === undefined) return undefined;
	if (requiresVideoType && video.type !== "video") return undefined;
	if (typeof video.data !== "string" || video.data.length === 0) return undefined;
	return { data: video.data, mime_type: video.mime_type };
}

function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function videoMediaType(value) {
	if (value === "video/mp4" || value === "video/webm" || value === "video/quicktime") return value;
	return "video/mp4";
}

function decodeBase64(data, label) {
	const clean = data.replace(/\s+/g, "");
	if (clean.length === 0) throw new Error(`${label} returned invalid base64 video data`);
	const decoded = Buffer.from(clean, "base64");
	if (decoded.length === 0) throw new Error(`${label} returned invalid base64 video data`);
	return new Uint8Array(decoded);
}