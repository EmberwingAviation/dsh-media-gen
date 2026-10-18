/**
 * dsh-media-gen — RunningHub（RH）标准模型 API 生图通道。
 *
 * 与视频通道共用同一套 RH 客户端语义：
 *   - model 填 `/openapi/v2/` 之后的路由，如 `rhart-image-g/text-to-image`；
 *   - 提交 `POST /openapi/v2/<route>` → 轮询 `POST /openapi/v2/query` → 下 `results[].url`；
 *   - 参考图先上传到 RH 换 `download_url`（RH 不接受 data URL）。
 *
 * 字段差异（RH 各图像模型并不统一）：
 *   - `rhart-image-g/*` 需要 `model` 子版本（默认 g-4.2）；
 *   - 多数模型用 `aspectRatio`（1:1 / 2:3 / 3:2）；seedream 一类用 `width/height`；
 *   - 编辑类把参考图放 `imageUrl`（单图）或 `imageUrls`（多图）。
 */
import { delay } from "./video-shared.js";
import { queryRunningHubTask, submitRunningHubTask, uploadRunningHubMedia } from "./video-runninghub.js";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_ROUTE = "seedream-v5-pro/text-to-image";
const ERROR_LIMIT = 4096;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;

/** 尺寸字段风格：aspectRatio（默认）/ wh（width+height）/ size（"1024x1024"）。 */
const SIZE_STYLE_BY_ROUTE = {
	"seedream-v5-pro/text-to-image": "wh",
	"seedream-v5-pro/image-to-image": "wh",
	"seedream-v5-lite/text-to-image": "wh",
	"seedream-v5-lite/image-to-image": "wh",
	"seedream-v5-flash/text-to-image": "wh",
	"seedream-v5-flash/image-to-image": "wh",
	"seedream-v4.7/text-to-image": "wh",
	"seedream-v4.7/image-to-image": "wh",
	"alibaba/qwen-image-3.0-pro/text-to-image": "size",
	"alibaba/qwen-image-3.0-pro/image-edit": "size",
	"alibaba/qwen-image-3.0/text-to-image": "size",
	"alibaba/qwen-image-3.0/image-edit": "size",
};

function trimBase(value) {
	const text = String(value ?? "").trim();
	return (text.length > 0 ? text : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function normalizeRunningHubImageRoute(model) {
	const raw = String(model ?? "").trim().replace(/^\/+/, "");
	const route = raw.length > 0 ? (raw.startsWith("openapi/v2/") ? raw.slice("openapi/v2/".length) : raw) : DEFAULT_ROUTE;
	if (/^(query|price-preview|media\/)/.test(route)) {
		throw new Error(`image_generate: RunningHub 的 model 不能是 ${route}；请填具体图像模型路由，如 rhart-image-g/text-to-image`);
	}
	return route;
}

/** 该路由是否需要 `model` 子版本（目前只有 rhart-image-g 系列）。 */
export function needsSubmodel(route) {
	return /^rhart-image-g\//.test(route);
}

export function isEditRoute(route) {
	return /image-to-image|image-edit|image-effects|image-tools/.test(route);
}

function imageFieldFor(route, referenceCount) {
	if (/rhart-image-g\//.test(route)) return "imageUrl";
	if (route.includes("seedream")) return "imageUrls";
	return referenceCount > 1 ? "imageUrls" : "imageUrl";
}

/** "1024x1024" → { width, height }（解析不出来返回 undefined）。 */
export function pixelSize(size) {
	const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(String(size ?? "").trim());
	if (match === null) return undefined;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
	return { width, height };
}

function aspectOf(size) {
	const pixels = pixelSize(size);
	if (pixels === undefined) return undefined;
	const ratio = pixels.width / pixels.height;
	if (Math.abs(ratio - 1) < 0.05) return "1:1";
	if (Math.abs(ratio - 2 / 3) < 0.06) return "2:3";
	if (Math.abs(ratio - 3 / 2) < 0.06) return "3:2";
	if (Math.abs(ratio - 9 / 16) < 0.04) return "9:16";
	if (Math.abs(ratio - 16 / 9) < 0.04) return "16:9";
	return undefined;
}

/** rhart-image-g 的 aspectRatio 实际枚举是像素串（真实 API 校验结果），不是 "1:1"。 */
const RHART_SIZE_BY_ASPECT = {
	"1:1": "960x960",
	"9:16": "720x1280",
	"16:9": "1280x720",
	"3:2": "1168x784",
	"2:3": "784x1168",
};

/** 把 image_generate 的 prompt/size 翻译成 RH 图像模型的字段。 */
export function buildRunningHubImagePayload(route, { prompt, size }) {
	const payload = { prompt: String(prompt ?? "").trim() };
	const aspect = aspectOf(size);

	if (needsSubmodel(route)) {
		payload.model = "g-4.2";
		payload.aspectRatio = RHART_SIZE_BY_ASPECT[aspect] ?? "960x960";
		return payload;
	}

	const style = SIZE_STYLE_BY_ROUTE[route];
	const pixels = pixelSize(size);
	if (style === "wh" && pixels !== undefined) {
		payload.width = pixels.width;
		payload.height = pixels.height;
	} else if (style === "size" && pixels !== undefined) {
		payload.size = `${pixels.width}x${pixels.height}`;
	} else if (aspect !== undefined) {
		payload.aspectRatio = aspect;
	}
	return payload;
}

function decodeDataUrl(value) {
	const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(value ?? ""));
	if (match === null) return undefined;
	return { mediaType: match[1], data: Buffer.from(match[2], "base64") };
}

async function fetchImageBytes(url, signal) {
	let response;
	try {
		response = await fetch(url, { signal });
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new Error(`image_generate: RunningHub 产物下载失败：${error instanceof Error ? error.message : String(error)}`);
	}
	if (!response.ok) throw new Error(`image_generate: RunningHub 产物下载 HTTP ${String(response.status)}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image_generate: RunningHub 产物超过 60MB");
	const contentType = response.headers.get("content-type") ?? "";
	const mime = contentType.startsWith("image/") ? contentType.split(";")[0] : sniffMime(url);
	return { data: bytes, mime };
}

function sniffMime(url) {
	const lower = String(url).toLowerCase();
	if (lower.includes(".png")) return "image/png";
	if (lower.includes(".webp")) return "image/webp";
	if (lower.includes(".gif")) return "image/gif";
	return "image/jpeg";
}

function firstResultUrl(poll) {
	const rows = Array.isArray(poll?.results) ? poll.results : [];
	for (const row of rows) {
		const url = row?.url ?? row?.fileUrl;
		if (typeof url === "string" && url.length > 0) return url;
	}
	throw new Error(`image_generate: RunningHub 任务成功但没有产物 URL：${JSON.stringify(poll).slice(0, 500)}`);
}

async function uploadReference(base, apiKey, reference, signal) {
	if (typeof reference !== "string") throw new Error("image_generate: 参考图必须是 URL 或 data URL");
	if (/^https?:\/\//i.test(reference)) return reference;
	const decoded = decodeDataUrl(reference);
	if (decoded === undefined) throw new Error("image_generate: 无法解析参考图（既不是 URL 也不是 base64 data URL）");
	return await uploadRunningHubMedia({
		baseUrl: base,
		apiKey,
		data: decoded.data,
		mediaType: decoded.mediaType,
		signal,
	});
}

/**
 * 生成图片。返回 [{ data: Buffer, mime }]，与其它 apiFormat 的生成器契约一致。
 */
export async function generateRunningHubImages({ provider, model, args, apiKey, signal, references }) {
	const base = trimBase(provider.baseUrl);
	const route = normalizeRunningHubImageRoute(model);
	const payload = buildRunningHubImagePayload(route, args);

	const refs = Array.isArray(references) ? references : [];
	if (isEditRoute(route)) {
		if (refs.length === 0) {
			throw new Error(`image_generate: ${route} 是编辑类模型，需要 referenceImages；请附 1–5 张参考图`);
		}
		const urls = [];
		for (const reference of refs.slice(0, 5)) urls.push(await uploadReference(base, apiKey, reference, signal));
		const field = imageFieldFor(route, urls.length);
		payload[field] = field === "imageUrls" ? urls : urls[0];
	}

	const taskId = await submitRunningHubTask({ base, apiKey, route, payload, signal });
	const pollIntervalMs = 3000;
	const deadline = Date.now() + 10 * 60 * 1000;
	for (;;) {
		if (Date.now() > deadline) {
			const last = await queryRunningHubTask({ base, apiKey, taskId, signal }).catch(() => undefined);
			if (last?.status === "SUCCESS") return [await fetchImageBytes(firstResultUrl(last), signal)];
			throw new Error(`image_generate: RunningHub 任务 ${taskId} 超时（最后状态：${last?.status ?? "unknown"}）`);
		}
		await delay(pollIntervalMs, signal);
		const poll = await queryRunningHubTask({ base, apiKey, taskId, signal });
		if (poll.status === "SUCCESS") return [await fetchImageBytes(firstResultUrl(poll), signal)];
		if (poll.status === "FAILED") {
			throw new Error(`image_generate: RunningHub 任务失败：${poll.errorCode ?? ""} ${poll.errorMessage ?? ""}`.trim());
		}
	}
}
