/**
 * dsh-media-gen — RunningHub（RH）标准模型 API 视频通道。
 *
 * 与其它 kind 的差异：
 *   - 一个 baseUrl + 一个 model（= /openapi/v2/ 之后的路由）就能出片，
 *     例如 model = "kling-v2.6-std/text-to-video"；
 *   - 图生视频必须先把源图上传到 RH 换 download_url（RH 不接受 data URL）；
 *   - 任务查询走 POST /openapi/v2/query，产物在 results[].url。
 *
 * 计费口径：调用的是供应商自己的 RunningHub 账户余额；本模块不做报价，
 * 需要精确控成本时用 rh-models-media skill 的 `price`（零成本）先问价。
 */
import { delay, downloadVideo, readBoundedText } from "./video-shared.js";

const ERROR_LIMIT = 4096;
const DEFAULT_BASE_URL = "https://www.runninghub.cn";

/** 常见路由的图片字段名（RH 各模型的字段并不统一，见 rh-models-media/references/models.md）。 */
const IMAGE_FIELD_BY_ROUTE = {
	"kling-v2.6-std/image-to-video": "imageUrl",
	"kling-v2.6-pro/image-to-video": "imageUrl",
	"kling-v2.5-turbo-std/image-to-video": "firstImageUrl",
	"kling-v2.5-turbo-pro/image-to-video": "firstImageUrl",
	"kling-v3-turbo-std/image-to-video": "firstImageUrl",
	"kling-v3-turbo-pro/image-to-video": "firstImageUrl",
	"kling-v3.0-std/image-to-video": "firstImageUrl",
	"kling-v3.0-pro/image-to-video": "firstImageUrl",
	"kling-video-o3-std/image-to-video": "firstImageUrl",
	"kling-video-o3-pro/image-to-video": "firstImageUrl",
	"rhart-video-g-official/image-to-video": "imageUrl",
	"rhart-video-v3.1-pro-official/image-to-video": "imageUrl",
	"rhart-video-v3.1-fast-official/image-to-video": "imageUrl",
	"rhart-video-v3.1-lite-official/image-to-video": "imageUrl",
	"rhart-video-sparkvideo-2.0/image-to-video": "firstFrameUrl",
};

function trimBase(baseUrl) {
	const value = String(baseUrl ?? "").trim();
	return (value.length > 0 ? value : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** 把用户填的 model 规整成 RH 路由（容忍带 /openapi/v2 前缀或首尾斜杠）。 */
export function normalizeRunningHubRoute(model) {
	const raw = String(model ?? "").trim().replace(/^\/+/, "");
	const route = raw.startsWith("openapi/v2/") ? raw.slice("openapi/v2/".length) : raw;
	if (route.length === 0) {
		throw new Error("RunningHub 供应商未配置 model；应填 /openapi/v2/ 之后的路由，如 kling-v2.6-std/text-to-video");
	}
	if (/^(query|price-preview|media\/)/.test(route)) {
		throw new Error(`RunningHub 供应商的 model 不能是 ${route}；请填具体模型路由，如 kling-v2.6-std/text-to-video`);
	}
	return route;
}

/** 图片字段名：精确表优先，其次按路由特征推断。 */
export function imageFieldForRoute(route) {
	if (IMAGE_FIELD_BY_ROUTE[route] !== undefined) return IMAGE_FIELD_BY_ROUTE[route];
	if (/^minimax\/|^alibaba\/wan-3|^pixverse|^rhart-video\/sparkvideo|^seedance-v1\.5/.test(route)) return "firstFrameUrl";
	if (/^alibaba\/wan-2\.7|^skyreels/.test(route)) return "firstImageUrl";
	if (/^rhart-video-g\//.test(route)) return "imageUrls";
	if (/^rhart-video-s/.test(route)) return "imageUrl";
	if (/reference-to-video/.test(route)) return "imageUrls";
	return "imageUrl";
}

/** "720*1280" / "720x1280" / "9:16" / "1280*720" → "9:16" 之类的画幅比例（拿不准就不传）。 */
export function aspectRatioFromSize(size) {
	const text = String(size ?? "").trim();
	if (text.length === 0) return undefined;
	if (/^\d+\s*:\s*\d+$/.test(text)) return text.replace(/\s+/g, "");
	const match = /^(\d+)\s*[*x×]\s*(\d+)$/i.exec(text);
	if (match === null) return undefined;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
	const divisor = greatestCommonDivisor(width, height);
	return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a, b) {
	let x = a;
	let y = b;
	while (y !== 0) {
		const next = x % y;
		x = y;
		y = next;
	}
	return x === 0 ? 1 : x;
}

/**
 * 把 media-gen 的通用参数翻译成 RH 模型的提交参数。
 * 不认识的模型只发 prompt（+ 图/时长），字段不对时 RH 会回 1007 并点名缺哪个字段。
 */
export function buildRunningHubPayload(route, input) {
	const payload = { prompt: String(input.prompt ?? "") };
	const sourceUrl = typeof input.sourceUrl === "string" && input.sourceUrl.length > 0 ? input.sourceUrl : undefined;

	if (sourceUrl !== undefined) {
		const field = imageFieldForRoute(route);
		payload[field] = field === "imageUrls" ? [sourceUrl] : sourceUrl;
	}

	if (typeof input.duration === "number" && Number.isFinite(input.duration) && input.duration > 0) {
		// 可灵一类是字符串枚举 "5"/"10"，另一些是整数；先按字符串给，RH 会做类型规整。
		payload.duration = String(Math.round(input.duration));
	}

	const aspectRatio = aspectRatioFromSize(input.size);
	if (aspectRatio !== undefined && /-to-video|video-extend|video-to-video/.test(route)) {
		payload.aspectRatio = aspectRatio;
	}
	return payload;
}

async function postRunningHubJson(base, path, body, { apiKey, signal }) {
	const url = `${base}${path}`;
	let response;
	try {
		response = await fetch(url, {
			method: "POST",
			signal,
			headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new Error(`RunningHub 请求失败（${path}）：${error instanceof Error ? error.message : String(error)}`);
	}
	const text = await readBoundedText(response, ERROR_LIMIT * 4);
	let json;
	try {
		json = text.length > 0 ? JSON.parse(text) : {};
	} catch {
		throw new Error(`RunningHub 返回了非 JSON 响应（HTTP ${String(response.status)}）：${text.slice(0, 300)}`);
	}
	if (!response.ok) {
		throw new Error(`RunningHub HTTP ${String(response.status)}：${json?.errorMessage ?? json?.msg ?? text.slice(0, 300)}`);
	}
	if (typeof json?.errorCode === "string" && json.errorCode.length > 0) {
		throw new Error(`RunningHub ${json.errorCode}：${json.errorMessage ?? "请求被拒绝"}`);
	}
	return json;
}

/** 上传本地字节到 RH，拿标准模型 API 可用的 download_url（24h 有效）。 */
export async function uploadRunningHubMedia({ baseUrl, apiKey, data, mediaType, signal }) {
	const base = trimBase(baseUrl);
	const extension = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
	const form = new FormData();
	form.append("file", new Blob([data], { type: mediaType }), `source.${extension}`);
	let response;
	try {
		response = await fetch(`${base}/openapi/v2/media/upload/binary`, {
			method: "POST",
			signal,
			headers: { authorization: `Bearer ${apiKey}` },
			body: form,
		});
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new Error(`RunningHub 上传失败：${error instanceof Error ? error.message : String(error)}`);
	}
	const text = await readBoundedText(response, ERROR_LIMIT * 4);
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`RunningHub 上传返回非 JSON（HTTP ${String(response.status)}）：${text.slice(0, 300)}`);
	}
	const downloadUrl = json?.data?.download_url;
	if (typeof downloadUrl !== "string" || downloadUrl.length === 0) {
		throw new Error(`RunningHub 上传未返回 download_url：${json?.message ?? text.slice(0, 300)}`);
	}
	return downloadUrl;
}

export async function submitRunningHubTask({ base, apiKey, route, payload, signal }) {
	const json = await postRunningHubJson(base, `/openapi/v2/${route}`, payload, { apiKey, signal });
	const taskId = json?.taskId ?? json?.data?.taskId;
	if (typeof taskId !== "string" || taskId.trim().length === 0) {
		throw new Error(`RunningHub 未返回 taskId：${JSON.stringify(json).slice(0, 500)}`);
	}
	return taskId;
}

async function queryRunningHubTask({ base, apiKey, taskId, signal }) {
	const json = await postRunningHubJson(base, "/openapi/v2/query", { taskId }, { apiKey, signal });
	return { ...json, status: String(json?.status ?? "").toUpperCase() };
}

function collectRunningHubOutput(poll) {
	const results = Array.isArray(poll?.results) ? poll.results : [];
	for (const row of results) {
		const url = row?.url ?? row?.fileUrl;
		if (typeof url === "string" && url.length > 0) return url;
	}
	throw new Error(`RunningHub 任务成功但没有产物 URL：${JSON.stringify(poll).slice(0, 500)}`);
}

async function downloadRunningHubVideo(url, input) {
	const downloaded = await downloadVideo(url, { maxBytes: input.maxBytes, signal: input.signal });
	return { data: downloaded.data, mediaType: "video/mp4", sourceUrl: url };
}

/**
 * 文生视频：提交 → 轮询 → 取产物。
 * 纪律与 openai-compatible 一致：超时/失败后不盲发新任务（上层登记簿按 taskKey 复用）。
 */
export async function generateRunningHubVideo(input) {
	const base = trimBase(input.baseUrl);
	const route = normalizeRunningHubRoute(input.model);
	if (/motion-control/.test(route)) {
		throw new Error("RunningHub motion-control 需要「驱动视频」输入，media-gen 只提供图片；请改用 rh-models-media skill 的 rh.py 调用该模型。");
	}
	const payload = buildRunningHubPayload(route, input);
	const taskId = await submitRunningHubTask({ base, apiKey: input.apiKey, route, payload, signal: input.signal });
	if (typeof input.onTaskId === "function") input.onTaskId(taskId);

	const deadline = Date.now() + input.waitTimeoutMs;
	const pollIntervalMs = Math.max(1000, Number(input.pollIntervalMs) || 5000);
	for (;;) {
		if (Date.now() > deadline) {
			// 截止复查：任务可能刚好完成（纪律：不盲发新任务）
			const finalPoll = await queryRunningHubTask({ base, apiKey: input.apiKey, taskId, signal: input.signal }).catch(() => undefined);
			if (finalPoll?.status === "SUCCESS") return await downloadRunningHubVideo(collectRunningHubOutput(finalPoll), input);
			throw new Error(
				`RunningHub 任务 ${taskId} 超时（${String(Math.round(input.waitTimeoutMs / 1000))}s，最后状态：${finalPoll?.status ?? "unknown"}）。任务仍在跑：可稍后用同一 prompt 重试（会先查旧任务），或传 resubmit=true 强制新任务。`,
			);
		}
		await delay(pollIntervalMs, input.signal);
		const poll = await queryRunningHubTask({ base, apiKey: input.apiKey, taskId, signal: input.signal });
		if (poll.status === "SUCCESS") return await downloadRunningHubVideo(collectRunningHubOutput(poll), input);
		if (poll.status === "FAILED") {
			throw new Error(`RunningHub 任务失败：${poll.errorCode ?? ""} ${poll.errorMessage ?? JSON.stringify(poll).slice(0, 300)}`.trim());
		}
	}
}

/** 图生视频：先上传源图换 download_url，再走文生视频同一条链路。 */
export async function animateRunningHubVideo(input) {
	const base = trimBase(input.baseUrl);
	const route = normalizeRunningHubRoute(input.model);
	if (/motion-control/.test(route)) {
		throw new Error("RunningHub motion-control 需要「驱动视频」输入，media-gen 只提供图片；请改用 rh-models-media skill 的 rh.py 调用该模型。");
	}
	const sourceUrl = await uploadRunningHubMedia({
		baseUrl: base,
		apiKey: input.apiKey,
		data: input.sourceImage.data,
		mediaType: input.sourceImage.mediaType,
		signal: input.signal,
	});
	return await generateRunningHubVideo({ ...input, sourceUrl });
}
