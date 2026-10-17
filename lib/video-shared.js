/** Values shared by the Host and browser Bundle faces. */
import { retryOnRateLimit, tagRateLimit, retryOnDispatchFailure, tagDispatchFailure } from "./rate-limit.js";
import { describeUpstreamError, requestIdFromHeaders } from "./upstream-error.js";

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
export async function downloadVideo(url, { maxBytes, signal, fetchImpl = fetch }) {
	const response = await fetchImpl(url, { redirect: "follow", ...(signal ? { signal } : {}) });
	if (!response.ok) throw new Error(`video download failed (${String(response.status)})`);
	const data = await readBoundedBytes(response, maxBytes);
	return { data, mediaType: videoMediaType(response.headers.get("content-type")) };
}

/**
 * 取回**已完成**任务的视频字节：先 `/videos/{id}/content`，再回退轮询结果里的 URL。
 *
 * 2026-10-11 调整为 content 优先：yotopivot 官方文档（第八章）明确要求「下载时使用本站
 * /content 接口，不要依赖其中的临时结果地址」——中转返回的 video_url / metadata.url
 * 多为上游 OSS 临时链接（会过期、可能跨域）。URL 只作为 /content 未实现时的兜底，
 * 且实测 URL 可能出现三种位置：顶层 video_url / output.video_url / metadata.url。
 *
 * fetchImpl 可注入，便于单测（本模块不依赖宿主，也不依赖任何外部包）。
 */
export async function fetchCompletedVideo({ base, taskId, pollJson, apiKey, maxBytes, signal, fetchImpl = fetch }) {
	const contentResponse = await fetchImpl(`${base}/videos/${encodeURIComponent(taskId)}/content`, {
		method: "GET",
		signal,
		headers: { authorization: `Bearer ${apiKey}` },
	}).catch(() => undefined);
	if (contentResponse?.ok === true) {
		const data = await readBoundedBytes(contentResponse, maxBytes);
		return { data, mediaType: videoMediaType(contentResponse.headers.get("content-type")) };
	}
	const metaUrl = typeof pollJson?.metadata?.url === "string" && pollJson.metadata.url.length > 0 ? pollJson.metadata.url : undefined;
	const relayUrl = pollJson?.video_url ?? pollJson?.output?.video_url ?? metaUrl;
	if (typeof relayUrl === "string" && relayUrl.length > 0) {
		return { ...(await downloadVideo(relayUrl, { maxBytes, signal, fetchImpl })), sourceUrl: relayUrl };
	}
	throw new Error(`video download failed: /content returned ${contentResponse === undefined ? "a network error" : String(contentResponse.status)} and the completion response carried no video URL`);
}

/** 创建请求遇「上游任务没建成」（503 fail_to_fetch_task）时的短退避预算（方案 B，2026-10-12）。 */
export const DEFAULT_DISPATCH_RETRY_BASE_MS = 15000;
export const DEFAULT_DISPATCH_RETRY_MAX = 2;

/**
 * 连接阶段失败的错误码：TCP 或 TLS 握手没完成 → **HTTP 请求根本没发出去** → 不可能产生任务。
 *
 * 实测（2026-10-12 傍晚）：yotopivot 的 TCP 443 用 27ms 就绪，但 TLS 握手 30s 无响应；
 * undici 同样报 `UND_ERR_CONNECT_TIMEOUT`（它的 connect 超时同时覆盖 TCP 与 TLS）。
 * 与"发出去之后才断"（ECONNRESET / 响应超时）不同，这类失败**确定没有副作用**。
 */
export const CONNECT_PHASE_ERROR_CODES = Object.freeze([
	"UND_ERR_CONNECT_TIMEOUT",
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
]);

/**
 * 把 fetch 的网络层异常包装成可读、可诊断、可决策的报错。
 *
 * 背景（2026-10-12 实测）：中转宕机时 undici 只抛一句 `fetch failed`，
 * 真正的原因码（`UND_ERR_CONNECT_TIMEOUT`）藏在 `error.cause` 里，从工具报错完全看不出来，
 * 得另写探针才能定位。这里把原因码提出来，并明确说明"为什么没有自动重发"。
 */
export function describeNetworkFailure(error, endpoint, label = "request failed") {
	const causeCode = error?.cause?.code ?? error?.cause?.errno;
	const detail = causeCode === undefined ? "" : ` [${String(causeCode)}]`;
	const connectPhase = CONNECT_PHASE_ERROR_CODES.includes(String(causeCode));
	const hint = connectPhase
		? "连接阶段（TCP/TLS 握手）即失败，请求没有到达中转、HTTP 报文还没发出（不可能已创建任务），确认站点恢复后可直接重试。"
		: "请求可能已送达中转，重发可能产生第二个任务并重复计费，因此未自动重试；请先核对站点状态与使用日志。";
	const wrapped = new Error(`${label}: 网络层失败，无法访问 ${endpoint} —— ${error?.message ?? String(error)}${detail}。${hint}`);
	wrapped.cause = error;
	wrapped.networkFailure = true;
	if (connectPhase) wrapped.connectPhaseFailure = true;
	return wrapped;
}

/**
 * 提交一次异步视频任务（OpenAI / Sora 风格 `POST {base}/videos`），带**两层正交退避**：
 *
 *   内层 retryOnDispatchFailure —— 只认「上游任务根本没建成」（503 fail_to_fetch_task），
 *                                  短退避 15s → 30s、最多 2 次，用来消化实测到的渠道瞬时抖动；
 *   外层 retryOnRateLimit      —— 只认限流/饱和，长退避 ≥60s。
 *
 * 两层各认各的标记，所以限流会穿过内层、派发失败不会触发 60s 长等；其余错误（配置类）
 * 立刻抛出——不会像 2026-10-09 那样把「渠道没配」伪装成「卡住 7 分钟」。
 *
 * fetchImpl / sleepFn 可注入，便于用本地假中转做单测（本模块不依赖宿主与外部包）。
 * 返回中转的任务对象（含 id / task_id）。
 */
export async function submitVideoTask({
	base,
	apiKey,
	model,
	prompt,
	size,
	duration,
	inputReference,
	signal,
	rateLimit,
	dispatchBaseMs = DEFAULT_DISPATCH_RETRY_BASE_MS,
	dispatchMaxRetries = DEFAULT_DISPATCH_RETRY_MAX,
	fetchImpl = fetch,
	sleepFn,
	label = "OpenAI video task creation failed",
}) {
	const requestBody = {
		model,
		prompt,
		...(size ? { size } : {}),
		...(duration ? { seconds: String(duration) } : {}),
		...(inputReference ? { input_reference: inputReference } : {}),
	};
	const submitOnce = async () => {
		let submit;
		try {
			submit = await fetchImpl(`${base}/videos`, {
				method: "POST",
				signal,
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});
		} catch (error) {
			// 网络层失败：undici 只抛 "fetch failed"，真正的原因码藏在 error.cause 里
			// （实测 2026-10-12 中转宕机时就是这样，裸报错完全看不出是连接超时）。
			const wrapped = describeNetworkFailure(error, `${base}/videos`, label);
			// 连接阶段失败（TCP/TLS 握手没完成、HTTP 报文还没发出）确定没有任务 → 与 503
			// fail_to_fetch_task 同类，交给内层 15s/30s 短退避重发；"发出后才断"（ECONNRESET 等）
			// 是模糊失败，connectPhaseFailure 为 undefined，因此不会被标记、也不会重发。
			tagDispatchFailure(wrapped, { connectPhase: wrapped.connectPhaseFailure });
			throw wrapped;
		}
		const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
		let parsed;
		try { parsed = JSON.parse(submitText); } catch { parsed = undefined; }
		if (!submit.ok) {
			const error = tagRateLimit(
				new Error(describeUpstreamError(label, submit.status, submitText, requestIdFromHeaders(submit.headers))),
				{ status: submit.status, payload: parsed },
			);
			// 503 + fail_to_fetch_task = 上游任务根本没建成 → 可安全短退避重发；
			// 真饱和已被 tagRateLimit 标记，tagDispatchFailure 会跳过它
			if (submit.status === 503) tagDispatchFailure(error, { payload: parsed });
			throw error;
		}
		if (parsed === undefined) throw new Error("OpenAI returned invalid JSON on task creation");
		return parsed;
	};
	const retryOptions = sleepFn === undefined ? {} : { sleepFn };
	return retryOnRateLimit(
		() => retryOnDispatchFailure(submitOnce, {
			signal,
			baseMs: dispatchBaseMs,
			maxRetries: dispatchMaxRetries,
			label: `${label} (dispatch)`,
			...retryOptions,
		}),
		{
			signal,
			baseMs: rateLimit?.baseMs,
			maxRetries: rateLimit?.maxRetries,
			label: "video submit",
			...retryOptions,
		},
	);
}