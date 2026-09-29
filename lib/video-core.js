/**
 * dsh-media-gen — 生视频 host 核心。
 * 复制自 dsh-video-gen@0.2.4（MIT © Yang-wudi，见 ../NOTICE.md）并适配：
 *   - 移除 settings 接线（settingsScope/installSection）；配置由合并入口的 volatile Config reader 提供
 *   - 单 provider 激活升级为多供应商目录（resolveVideoEntry + 工具 per-call provider 参数）
 *   - openai-compatible kind 新增图生视频（input_reference data URL，实测中转站转存 OSS 后转发上游）
 */
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
	VIDEO_ROUTE,
	DEFAULT_MAX_VIDEO_BYTES,
	delay,
	readBoundedText,
	readBoundedBytes,
	videoMediaType,
	downloadVideo,
} from "./video-shared.js";
import { resolveVideoEntry } from "./media-config.js";
import { retryOnRateLimit, tagRateLimit } from "./rate-limit.js";
import {
	taskKeyFor,
	rememberTask,
	trackedTask,
	forgetTask,
	decideTrackedTask,
	describeTrackedTask,
} from "./video-tasks.js";

import { generateGoogleVideo, animateGoogleVideo } from "./video-google.js";
import { resolveReferenceImage } from "./video-reference-image.js";

//#region config
const ERROR_LIMIT = 4096;

// 统一 Config schema（volatile）与 resolveVideoEntry 位于 ./media-config.js；
// 合并入口通过 getConfig() 传入展开后的视频配置快照。
//#endregion

//#region DashScope (Aliyun Wanx text-to-video) adapter
async function generateDashScopeVideo(input) {
	const submit = await retryOnRateLimit(async () => {
		const response = await fetch(`${input.endpoint}/services/aigc/video-generation/video-synthesis`, {
			method: "POST",
			signal: input.signal,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${input.apiKey}`,
				"X-DashScope-Async": "enable",
			},
			body: JSON.stringify({
				model: input.model,
				input: { prompt: input.prompt },
				parameters: {
					...(input.size ? { size: input.size } : {}),
					...(input.duration ? { duration: input.duration } : {}),
				},
			}),
		});
		if (!response.ok) {
			const text = await readBoundedText(response, ERROR_LIMIT * 4).catch(() => "");
			let parsed;
			try { parsed = JSON.parse(text); } catch { parsed = undefined; }
			throw tagRateLimit(new Error(`DashScope video task creation failed (${response.status}): ${text.slice(0, ERROR_LIMIT)}`), { status: response.status, payload: parsed });
		}
		return response;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "dashscope submit" });
	return pollDashScopeTask(submit, input);
}

/** DashScope image-to-video: submit with a reference image. */
async function animateDashScopeVideo(input) {
	const { data, mediaType } = input.sourceImage;
	const imageBase64 = Buffer.from(data).toString("base64");
	const imageDataUrl = `data:${mediaType};base64,${imageBase64}`;

	const submit = await retryOnRateLimit(async () => {
		const response = await fetch(`${input.endpoint}/services/aigc/video-generation/video-synthesis`, {
			method: "POST",
			signal: input.signal,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${input.apiKey}`,
				"X-DashScope-Async": "enable",
			},
			body: JSON.stringify({
				model: input.model,
				input: {
					prompt: input.prompt,
					image: imageDataUrl,
				},
				parameters: {
					...(input.size ? { size: input.size } : {}),
					...(input.duration ? { duration: input.duration } : {}),
				},
			}),
		});
		if (!response.ok) {
			const text = await readBoundedText(response, ERROR_LIMIT * 4).catch(() => "");
			let parsed;
			try { parsed = JSON.parse(text); } catch { parsed = undefined; }
			throw tagRateLimit(new Error(`DashScope video task creation failed (${response.status}): ${text.slice(0, ERROR_LIMIT)}`), { status: response.status, payload: parsed });
		}
		return response;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "dashscope submit (i2v)" });
	return pollDashScopeTask(submit, input);
}

async function pollDashScopeTask(submit, input) {
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`DashScope video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson;
	try { submitJson = JSON.parse(submitText); } catch { throw new Error("DashScope returned invalid JSON on task creation"); }
	const taskId = submitJson.output?.task_id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error(`DashScope did not return a task_id: ${submitText.slice(0, ERROR_LIMIT)}`);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) throw new Error(`DashScope video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s`);
		await delay(input.pollIntervalMs, input.signal);
		const pollJson = await retryOnRateLimit(async () => {
			const poll = await fetch(`${input.endpoint}/tasks/${encodeURIComponent(taskId)}`, {
				method: "GET",
				signal: input.signal,
				headers: { authorization: `Bearer ${input.apiKey}` },
			});
			const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
			let parsed;
			try { parsed = JSON.parse(pollText); } catch { throw new Error("DashScope returned invalid JSON on task poll"); }
			if (!poll.ok) throw tagRateLimit(new Error(`DashScope task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`), { status: poll.status, payload: parsed });
			return parsed;
		}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "dashscope poll" });
		const status = pollJson.output?.task_status;
		if (status === "SUCCEEDED") {
			const url = pollJson.output?.video_url ?? pollJson.output?.results?.[0]?.url;
			if (typeof url !== "string" || url.length === 0) throw new Error("DashScope task succeeded but returned no video URL");
			return { ...(await downloadVideo(url, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: url };
		}
		if (status === "FAILED" || status === "UNKNOWN") {
			throw new Error(`DashScope video task ${status}: ${pollJson.output?.message ?? JSON.stringify(pollJson).slice(0, ERROR_LIMIT)}`);
		}
	}
}
//#endregion

//#region Volcengine Ark (Doubao Seedance text-to-video) adapter
async function generateVolcengineVideo(input) {
	const content = [{ type: "text", text: buildVolcenginePrompt(input) }];
	return submitVolcengineTask(input, content);
}

/** Volcengine image-to-video: include the source image as a data URL in content. */
async function animateVolcengineVideo(input) {
	const { data, mediaType } = input.sourceImage;
	const imageBase64 = Buffer.from(data).toString("base64");
	const imageDataUrl = `data:${mediaType};base64,${imageBase64}`;

	const content = [
		{ type: "image_url", image_url: { url: imageDataUrl } },
		{ type: "text", text: buildVolcenginePrompt(input) },
	];
	return submitVolcengineTask(input, content);
}

async function submitVolcengineTask(input, content) {
	const submitJson = await retryOnRateLimit(async () => {
		const submit = await fetch(`${input.baseURL}/contents/generations/tasks`, {
			method: "POST",
			signal: input.signal,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${input.apiKey}`,
			},
			body: JSON.stringify({ model: input.model, content }),
		});
		const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
		let parsed;
		try { parsed = JSON.parse(submitText); } catch { parsed = undefined; }
		if (!submit.ok) throw tagRateLimit(new Error(`Volcengine video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`), { status: submit.status, payload: parsed });
		if (parsed === undefined) throw new Error("Volcengine returned invalid JSON on task creation");
		return parsed;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "volcengine submit" });
	const taskId = submitJson.id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error(`Volcengine did not return a task id: ${submitText.slice(0, ERROR_LIMIT)}`);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) throw new Error(`Volcengine video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s`);
		await delay(input.pollIntervalMs, input.signal);
		const pollJson = await retryOnRateLimit(async () => {
			const poll = await fetch(`${input.baseURL}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
				method: "GET",
				signal: input.signal,
				headers: { authorization: `Bearer ${input.apiKey}` },
			});
			const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
			let parsed;
			try { parsed = JSON.parse(pollText); } catch { throw new Error("Volcengine returned invalid JSON on task poll"); }
			if (!poll.ok) throw tagRateLimit(new Error(`Volcengine task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`), { status: poll.status, payload: parsed });
			return parsed;
		}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "volcengine poll" });
		const status = pollJson.status;
		if (status === "succeeded") {
			const url = pollJson.content?.video_url;
			if (typeof url !== "string" || url.length === 0) throw new Error("Volcengine task succeeded but returned no video_url");
			return { ...(await downloadVideo(url, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: url };
		}
		if (status === "failed" || status === "cancelled") {
			throw new Error(`Volcengine video task ${status}: ${pollJson.error?.message ?? JSON.stringify(pollJson).slice(0, ERROR_LIMIT)}`);
		}
	}
}

function buildVolcenginePrompt(input) {
	let text = input.prompt;
	if (input.size && !/--(?:ratio|rt)\b/.test(text)) text += ` --ratio ${input.size}`;
	if (input.duration && !/--(?:dur|duration)\b/.test(text)) text += ` --dur ${input.duration}`;
	return text;
}
//#endregion

//#region OpenAI-compatible (Sora text-to-video) adapter
/** 单次任务状态查询（带限流退避）；轮询、截止复查与"先查旧任务"纪律共用。 */
async function queryOpenAITaskState(base, taskId, input) {
	const url = `${base}/videos/${encodeURIComponent(taskId)}`;
	return retryOnRateLimit(async () => {
		const poll = await fetch(url, {
			method: "GET",
			signal: input.signal,
			headers: { authorization: `Bearer ${input.apiKey}` },
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		let pollJson;
		try { pollJson = JSON.parse(pollText); } catch { throw new Error("OpenAI returned invalid JSON on task poll"); }
		if (!poll.ok) throw tagRateLimit(new Error(`OpenAI video task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`), { status: poll.status, payload: pollJson });
		return pollJson;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "video poll" });
}

/** 把 completed 轮询结果取成视频字节（URL 三级兜底 + /content 兜底）。 */
async function collectOpenAICompletion(base, taskId, pollJson, input) {
	// 中转成功态的 URL 位置实测有三种可能：顶层 video_url / output.video_url / metadata.url
	const metaUrl = typeof pollJson.metadata?.url === "string" && pollJson.metadata.url.length > 0 ? pollJson.metadata.url : undefined;
	const relayUrl = pollJson.video_url ?? pollJson.output?.video_url ?? metaUrl;
	if (typeof relayUrl === "string" && relayUrl.length > 0) {
		return { ...(await downloadVideo(relayUrl, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: relayUrl };
	}
	const contentResponse = await fetch(`${base}/videos/${encodeURIComponent(taskId)}/content`, {
		method: "GET",
		signal: input.signal,
		headers: { authorization: `Bearer ${input.apiKey}` },
	});
	if (!contentResponse.ok) throw new Error(`OpenAI video content download failed (${contentResponse.status})`);
	const data = await readBoundedBytes(contentResponse, input.maxBytes);
	const mediaType = videoMediaType(contentResponse.headers.get("content-type"));
	return { data, mediaType };
}

async function generateOpenAIVideo(input) {
	const base = input.baseURL.endsWith("/") ? input.baseURL.slice(0, -1) : input.baseURL;
	const requestBody = {
		model: input.model,
		prompt: input.prompt,
		...(input.size ? { size: input.size } : {}),
		...(input.duration ? { seconds: String(input.duration) } : {}),
		...(input.inputReference ? { input_reference: input.inputReference } : {}),
	};
	const submitJson = await retryOnRateLimit(async () => {
		const submit = await fetch(`${base}/videos`, {
			method: "POST",
			signal: input.signal,
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${input.apiKey}`,
			},
			body: JSON.stringify(requestBody),
		});
		const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
		let parsed;
		try { parsed = JSON.parse(submitText); } catch { parsed = undefined; }
		if (!submit.ok) throw tagRateLimit(new Error(`OpenAI video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`), { status: submit.status, payload: parsed });
		if (parsed === undefined) throw new Error("OpenAI returned invalid JSON on task creation");
		return parsed;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "video submit" });
	const taskId = submitJson.id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error("OpenAI did not return a video task id");
	if (input.taskKey) rememberTask(input.taskKey, taskId);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) {
			// 截止复查：任务可能刚好完成——先查一次再决定放弃（纪律：不盲发新任务）
			const finalState = await queryOpenAITaskState(base, taskId, input).catch(() => undefined);
			if (finalState?.status === "completed") {
				if (input.taskKey) forgetTask(input.taskKey);
				return collectOpenAICompletion(base, taskId, finalState, input);
			}
			throw new Error(`OpenAI video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s (last state: ${describeTrackedTask(finalState)}). The task stays tracked: a retry with the same prompt/provider checks it first instead of submitting a new one; pass resubmit=true to force a new task.`);
		}
		await delay(input.pollIntervalMs, input.signal);
		const pollJson = await queryOpenAITaskState(base, taskId, input);
		const status = pollJson.status;
		if (status === "completed") {
			if (input.taskKey) forgetTask(input.taskKey);
			return collectOpenAICompletion(base, taskId, pollJson, input);
		}
		if (status === "failed" || status === "cancelled") {
			if (input.taskKey) forgetTask(input.taskKey);
			throw new Error(`OpenAI video task ${status}: ${pollJson.error?.message ?? JSON.stringify(pollJson).slice(0, ERROR_LIMIT)}`);
		}
	}
}

/** OpenAI-compatible 图生视频：源图以 data URL 经 input_reference 传入（中转站会转存后转发上游，实测可用；失败任务不计费）。 */
async function animateOpenAIVideo(input) {
	const { data, mediaType } = input.sourceImage;
	const dataUrl = `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`;
	return generateOpenAIVideo({ ...input, inputReference: dataUrl });
}
//#endregion

//#region in-memory video store + HTTP route
const videoCache = new Map();
const MAX_CACHE_ENTRIES = 24;
const MAX_ROUTE_BODY_BYTES = 8192;
const VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);
const VIDEO_EXTENSION_MEDIA_TYPE = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
/**
 * Marker index co-located with saved videos (one per video folder). It records
 * { videoId -> file } so the HTTP route can re-serve a video from disk after a
 * host restart, when both the in-memory byte cache and the trusted-root set
 * are gone. Only the plugin writes markers, which makes them the trust anchor
 * for post-restart reads.
 */
const WORKSPACE_MARKER_NAME = ".dsh-video-gen-index.json";

// Workspace roots seen while persisting videos this process lifetime. The POST
// fallback only reads files contained inside one of these trusted roots, so a
// client-supplied savedTo path can never escape the workspace (defense-in-depth
// on top of the realpath containment check).
const knownWorkspaceRoots = new Set();

function rememberWorkspaceRoot(root) {
	if (typeof root === "string" && root.length > 0) knownWorkspaceRoots.add(resolve(root));
}

function cacheVideo(data, mediaType) {
	const id = randomUUID();
	videoCache.set(id, { data, mediaType });
	while (videoCache.size > MAX_CACHE_ENTRIES) {
		const oldest = videoCache.keys().next().value;
		if (oldest === undefined) break;
		videoCache.delete(oldest);
	}
	return id;
}

/** A video file name safe to join onto a directory: no separators, known extension. */
function safeVideoFileName(name) {
	if (typeof name !== "string" || name.length === 0) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return false;
	return VIDEO_FILE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Parse the marker index in dir and return one video entry, or undefined. */
async function readWorkspaceMarkerEntry(dir, videoId) {
	try {
		const parsed = JSON.parse(await readFile(join(dir, WORKSPACE_MARKER_NAME), "utf8"));
		const videos = parsed && typeof parsed === "object" && parsed.videos && typeof parsed.videos === "object" && !Array.isArray(parsed.videos)
			? parsed.videos
			: undefined;
		const entry = videos ? videos[videoId] : undefined;
		if (entry && typeof entry === "object" && typeof entry.file === "string") return entry;
		return undefined;
	} catch {
		return undefined;
	}
}

/** Merge one video entry into the marker index next to the saved file (best effort). */
async function upsertWorkspaceMarker(dir, videoId, file, mediaType, bytes) {
	const markerPath = join(dir, WORKSPACE_MARKER_NAME);
	let videos = {};
	try {
		const parsed = JSON.parse(await readFile(markerPath, "utf8"));
		if (parsed && typeof parsed === "object" && parsed.videos && typeof parsed.videos === "object" && !Array.isArray(parsed.videos)) {
			videos = parsed.videos;
		}
	} catch { /* first save or unreadable marker: start a fresh index */ }
	videos[videoId] = { file, mediaType, bytes, createdAt: Date.now() };
	const staging = join(dir, `.${WORKSPACE_MARKER_NAME}.${process.pid}-${randomUUID()}.tmp`);
	try {
		await writeFile(staging, JSON.stringify({ version: 1, videos }, null, "\t"), { flag: "wx" });
		await rename(staging, markerPath);
	} catch (error) {
		await unlink(staging).catch(() => {});
		// The marker only powers gallery durability after restarts; a failed
		// write must never fail the generation itself.
		console.warn("[dsh-video-gen] failed to update the gallery marker index:", error instanceof Error ? error.message : error);
	}
}

function readRouteBody(req) {
	return new Promise((resolvePromise, rejectPromise) => {
		const chunks = [];
		let bytes = 0;
		req.on("data", (chunk) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += buffer.byteLength;
			if (bytes > MAX_ROUTE_BODY_BYTES) { rejectPromise(new Error("request too large")); req.destroy(); return; }
			chunks.push(buffer);
		});
		req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
		req.on("error", rejectPromise);
	});
}

function originAllowed(req) {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin === undefined || host === undefined) return true;
	return origin === `http://${host}` || origin === `https://${host}`;
}

/**
 * Resolve a persisted savedTo path to real bytes. Two paths:
 * 1. Fast path — the file sits inside a workspace root recorded during this
 *    process lifetime, enforced by realpath containment.
 * 2. Durable path — the co-located marker index (written at save time) proves
 *    the video folder, so reads keep working after a host restart, when the
 *    trusted-root set is empty. Reads stay confined to the marker's directory.
 * Returns { data, mediaType } or undefined when the path is missing, out of
 * bounds, or not a recognized video file.
 */
async function readPersistedVideo(attachment) {
	const record = attachment && typeof attachment === "object" ? attachment : undefined;
	const savedTo = typeof record?.savedTo === "string" ? record.savedTo : undefined;
	if (typeof savedTo !== "string" || savedTo.length === 0) return undefined;
	if (!safeVideoFileName(savedTo.slice(Math.max(savedTo.lastIndexOf("/"), savedTo.lastIndexOf("\\")) + 1))) return undefined;

	if (knownWorkspaceRoots.size > 0) {
		try {
			const realFile = await realpath(savedTo);
			for (const root of knownWorkspaceRoots) {
				let realRoot;
				try { realRoot = await realpath(root); }
				catch { continue; }
				if (containsPath(realRoot, realFile)) {
					const data = await readFile(realFile);
					return { data, mediaType: VIDEO_EXTENSION_MEDIA_TYPE[savedTo.slice(savedTo.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream" };
				}
			}
		} catch { /* fall through to the marker path */ }
	}

	const videoId = typeof record?.videoId === "string" ? record.videoId : undefined;
	if (videoId === undefined || videoId.length === 0) return undefined;
	const dir = dirname(savedTo);
	const entry = await readWorkspaceMarkerEntry(dir, videoId);
	if (entry === undefined) return undefined;
	if (!safeVideoFileName(entry.file)) return undefined;
	const fileName = savedTo.slice(Math.max(savedTo.lastIndexOf("/"), savedTo.lastIndexOf("\\")) + 1);
	if (entry.file !== fileName) return undefined;
	try {
		const realFile = await realpath(join(dir, entry.file));
		const realDir = await realpath(dir);
		if (!containsPath(realDir, realFile)) return undefined;
		const data = await readFile(realFile);
		return { data, mediaType: VIDEO_EXTENSION_MEDIA_TYPE[entry.file.slice(entry.file.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream" };
	} catch {
		return undefined;
	}
}

function sendVideoBytes(req, res, data, mediaType) {
	res.statusCode = 200;
	res.setHeader("content-type", mediaType);
	res.setHeader("content-length", String(data.byteLength));
	res.setHeader("cache-control", "private, no-store");
	res.setHeader("x-content-type-options", "nosniff");
	res.setHeader("accept-ranges", "none");
	if (req.method === "HEAD") { res.end(); return; }
	res.end(Buffer.from(data));
}

/**
 * Serve a generated video. Fast path: GET/HEAD ?id= from the in-memory cache
 * (immediate playback). Persistence fallback: POST { attachment: { videoId,
 * savedTo, mediaType } } reads the durable workspace file when the cache has
 * evicted the id or the server restarted, so the gallery survives beyond the
 * 24-entry LRU window — and, thanks to the co-located marker index, beyond a
 * host restart.
 */
async function serveVideo(req, res) {
	try {
		if (req.method === "POST") {
			if (!originAllowed(req)) { res.statusCode = 403; res.end("origin rejected"); return; }
			let body;
			try { body = JSON.parse(await readRouteBody(req)); }
			catch { res.statusCode = 400; res.end("invalid request"); return; }
			const attachment = body && typeof body === "object" && body.attachment && typeof body.attachment === "object" ? body.attachment : undefined;
			const cachedId = typeof attachment?.videoId === "string" ? attachment.videoId : undefined;
			const cached = cachedId === undefined ? undefined : videoCache.get(cachedId);
			if (cached !== undefined) { sendVideoBytes(req, res, cached.data, cached.mediaType); return; }
			const persisted = await readPersistedVideo(attachment);
			if (persisted === undefined) { res.statusCode = 404; res.setHeader("content-type", "text/plain; charset=utf-8"); res.end("video not found"); return; }
			sendVideoBytes(req, res, persisted.data, persisted.mediaType);
			return;
		}
		const url = new URL(req.url ?? "", "http://localhost");
		const id = url.searchParams.get("id");
		const entry = id === null ? undefined : videoCache.get(id);
		if (entry === undefined) {
			res.statusCode = 404;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("video not found");
			return;
		}
		sendVideoBytes(req, res, entry.data, entry.mediaType);
	} catch {
		res.statusCode = 500;
		res.end("video route error");
	}
}
//#endregion

//#region workspace save
function workspaceVideoName(mediaType) {
	const ext = mediaType === "video/webm" ? "webm" : mediaType === "video/quicktime" ? "mov" : "mp4";
	return `video-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
}

function containsPath(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function workspaceVideoDir(workspaceRoot, folder) {
	const trimmed = (folder ?? "").trim();
	const root = resolve(workspaceRoot);
	const dir = trimmed === "" ? root : resolve(root, trimmed);
	// Backslash separators are rejected on every platform: on Windows they are
	// path separators (so "..\\escape" would traverse), while on POSIX they are
	// legal filename characters and resolve() would not treat them as traversal.
	// A folder coming from model output has no business containing them, so both
	// platforms reject uniformly instead of disagreeing with the security tests.
	if (trimmed.includes("\\")) throw new Error(`video workspace folder '${folder}' must stay inside the session workspace`);
	if (!containsPath(root, dir)) throw new Error(`video workspace folder '${folder}' must stay inside the session workspace`);
	return dir;
}

async function nearestExistingRealPath(dir) {
	let probe = dir;
	for (;;) {
		try { return await realpath(probe); }
		catch (error) {
			if (error?.code !== "ENOENT") throw error;
			const parent = dirname(probe);
			if (parent === probe) throw error;
			probe = parent;
		}
	}
}

function assertInsideWorkspace(realRoot, candidate, folder) {
	if (containsPath(realRoot, candidate)) return;
	throw new Error(`video workspace folder '${folder ?? ""}' must stay inside the session workspace`);
}

async function saveVideoToWorkspace(options) {
	const dir = workspaceVideoDir(options.workspaceRoot, options.folder);
	options.signal?.throwIfAborted();
	const realRoot = await realpath(resolve(options.workspaceRoot));
	assertInsideWorkspace(realRoot, await nearestExistingRealPath(dir), options.folder);
	const name = workspaceVideoName(options.mediaType);
	const target = join(dir, name);
	const staging = join(dir, `.${name}.${process.pid}-${randomUUID()}.tmp`);
	await mkdir(dir, { recursive: true });
	assertInsideWorkspace(realRoot, await realpath(dir), options.folder);
	try {
		await writeFile(staging, options.data, { flag: "wx", signal: options.signal });
		options.signal?.throwIfAborted();
		await rename(staging, target);
	} catch (error) {
		await unlink(staging).catch(() => {});
		throw error;
	}
	return target;
}
//#endregion

//#region tool + plugin wiring
// 插件级 name/inject 由合并入口 lib/index.js 统一提供（tools/credentials/webServer/attachments）。

/**
 * Every image the running conversation carries, oldest first. This is what
 * source_attachment_id names, and what "the newest image" means when the model
 * omits both arguments, so image-to-video works from a picture the user pasted
 * straight into the chat.
 * @param agent - the executing agent, when the tool runs inside a session.
 * @returns the conversation's image references in conversation order.
 */
function collectConversationImages(agent) {
	const messages = agent?.session?.deriveMessages?.() ?? [];
	const refs = [];
	const walk = (blocks, into) => {
		if (!Array.isArray(blocks)) return;
		for (const block of blocks) {
			if (block?.type === "image" && block.attachment !== undefined) into.push(block.attachment);
			else if (block?.type === "tool-result") walk(block.content, into);
		}
	};
	for (const message of messages) walk(message?.content, refs);
	return refs;
}

const VIDEO_OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		provider: { type: "string", required: true },
		model: { type: "string", required: true },
		videoId: { type: "string", required: true },
		mediaType: { type: "string", required: true },
		bytes: { type: "integer", required: true },
		route: { type: "string", required: true },
		sourceUrl: { type: "string" },
		savedTo: { type: "string" },
		saveError: { type: "string" },
		attachment: {
			type: "object",
			additionalProperties: false,
			properties: {
				videoId: { type: "string", required: true },
				savedTo: { type: "string", required: true },
				mediaType: { type: "string", required: true },
			},
		},
	},
};

async function finishVideo(generated, active, config, exec) {
	const videoId = cacheVideo(generated.data, generated.mediaType);
	const value = {
		provider: active.provider,
		model: active.model,
		videoId,
		mediaType: generated.mediaType,
		bytes: generated.data.byteLength,
		route: `${VIDEO_ROUTE}?id=${videoId}`,
		...(generated.sourceUrl ? { sourceUrl: generated.sourceUrl } : {}),
	};
	if (config.saveToWorkspace === false) return value;
	const workspaceRoot = exec.agent?.session.header.cwd;
	if (workspaceRoot === undefined) return value;
	try {
		value.savedTo = await saveVideoToWorkspace({
			workspaceRoot,
			folder: config.workspaceFolder,
			mediaType: generated.mediaType,
			data: generated.data,
			signal: exec.signal,
		});
		// Record the trusted root for this lifetime and co-locate a marker index
		// so the route can re-serve the video from disk even after a restart,
		// when both the byte cache and the trusted-root set are gone.
		rememberWorkspaceRoot(workspaceRoot);
		await upsertWorkspaceMarker(dirname(value.savedTo), videoId, basename(value.savedTo), generated.mediaType, generated.data.byteLength);
		value.attachment = { videoId, savedTo: value.savedTo, mediaType: generated.mediaType };
	} catch (error) {
		exec.signal.throwIfAborted();
		value.saveError = error instanceof Error ? error.message : String(error);
	}
	return value;
}

function videoPresentation(result) {
	const meta = result.meta;
	if (meta === undefined || meta === null || typeof meta !== "object") return undefined;
	if (typeof meta.route !== "string") return undefined;
	return {
		card: "generic",
		title: "Generated video",
		content: [{ type: "text", text: `Video generated with ${meta.provider}/${meta.model}.` }],
	};
}

// settings 接线已移除：DSH >= 0.1.6 的配置面由 volatile Config（lib/media-config.js）
// + client configForms（lib/client-video.js）提供，不再需要 settingsScope/installSection。

/** Register video route, generate_video tool, and animate_image tool; getConfig() 返回展开后的视频配置快照。 */
export function applyVideo(ctx, getConfig) {
	const current = getConfig;

	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: VIDEO_ROUTE,
		handler: (req, res) => serveVideo(req, res),
	}), "dsh-media-gen: video route");

	// --- generate_video tool (text-to-video) ---
	ctx.tools.register(defineTool({
		name: "generate_video",
		description: "Generate one short video from a text prompt with the configured video provider (DashScope Wanx, Volcengine/Doubao Seedance, Google Veo, or an OpenAI/Sora-compatible endpoint). Use only when the user explicitly asks to create or generate a video. Give a complete visual prompt: subject, action, camera movement, setting, mood, and style. Generation is asynchronous and may take one to several minutes. On success the video is streamed into the conversation and, with workspace saving enabled (the default), also written as a file whose absolute path is in the result's savedTo field. Do not call read, glob, or other tools to locate or verify the video.",
		parameters: {
			prompt: { type: "string", required: true, description: "Complete text description of the video to generate (subject, action, camera, setting, mood, style)." },
			size: { type: "string", description: "Optional resolution or aspect ratio, e.g. '1280*720' for DashScope or '16:9' for Seedance/Sora." },
			duration: { type: "integer", description: "Optional clip length in seconds (provider-dependent, e.g. 5 or 10)." },
			provider: { type: "string", description: "Optional video provider id from the configured catalog (Settings → Plugins → dsh-media-gen → Video generation); omit to use the selected default." },
			resubmit: { type: "boolean", description: "Optional; true forces a new task even when a previous task for the same prompt/provider is still tracked. Default false: a still-running tracked task is reported instead of resubmitting (avoids adding upstream congestion)." },
		},
		output: {
			schema: VIDEO_OUTPUT_SCHEMA,
			render: (_args, value) => {
				const saved = typeof value.savedTo === "string"
					? ` It was also saved to the workspace as ${value.savedTo}.`
					: typeof value.saveError === "string"
						? ` Saving it to the workspace failed: ${value.saveError}.`
						: "";
				return [{
					type: "text",
					text: `Generated one video with ${value.provider}/${value.model} (${String(value.bytes)} bytes). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the video.`,
				}];
			},
			presentationMeta: (args, value) => ({
				kind: "dsh-video-gen",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(value.attachment && typeof value.attachment === "object" ? { attachment: value.attachment } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				...(typeof args.duration === "number" ? { duration: args.duration } : {}),
				prompt: args.prompt,
			}),
		},
		timeoutMs: (current().waitTimeoutMs ?? 600000) + 60000,
		async execute(args, exec) {
			const cfg = current();
			if (cfg.videoEnabled === false) {
				throw new Error("generate_video: 视频工具已停用（设置 → 插件 → 插件配置 → dsh-media-gen → 视频生成）。");
			}
			const active = resolveVideoEntry(cfg, args.provider);
			const credential = await ctx.credentials.resolve(credentialRef(active.apiKeyEnv));
			if (credential === undefined || credential.value.length === 0) {
				throw new Error(`generate_video requires the ${active.apiKeyEnv} credential; configure it in Settings → Plugins → dsh-media-gen → Video generation.`);
			}
			const rateLimit = { baseMs: cfg.rateLimitBaseMs ?? 60000, maxRetries: cfg.rateLimitMaxRetries ?? 3 };
			let taskKey;
			if (active.kind === "openai-compatible") {
				// 纪律：先查旧任务再决定重提，避免连发新任务加重上游淤积
				taskKey = taskKeyFor(active.id, "t2v", args.prompt, undefined);
				const tracked = args.resubmit === true ? undefined : trackedTask(taskKey);
				if (tracked !== undefined) {
					const state = await queryOpenAITaskState(active.baseUrl, tracked.taskId, { apiKey: credential.value, signal: exec.signal, rateLimit }).catch(() => undefined);
					const decision = state === undefined ? "blocked" : decideTrackedTask(state);
					if (decision === "reuse") {
						const reused = await collectOpenAICompletion(active.baseUrl, tracked.taskId, state, { maxBytes: DEFAULT_MAX_VIDEO_BYTES, signal: exec.signal });
						forgetTask(taskKey);
						return finishVideo(reused, { provider: active.id, model: active.model }, cfg, exec);
					}
					if (decision === "blocked") {
						throw new Error(`旧任务 ${tracked.taskId} 仍为 ${describeTrackedTask(state)}；为避免加重上游淤积未重提。请稍后重试（完成后将直接取其结果），或传 resubmit=true 强制新任务。`);
					}
					forgetTask(taskKey);
				}
			}
			const shared = {
				apiKey: credential.value,
				model: active.model,
				prompt: args.prompt,
				size: args.size,
				duration: args.duration,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				pollIntervalMs: cfg.pollIntervalMs ?? 5000,
				waitTimeoutMs: cfg.waitTimeoutMs ?? 600000,
				signal: exec.signal,
				rateLimit,
				taskKey,
			};
			let generated;
			if (active.kind === "dashscope") {
				generated = await generateDashScopeVideo({ ...shared, endpoint: active.baseUrl });
			} else if (active.kind === "volcengine") {
				generated = await generateVolcengineVideo({ ...shared, baseURL: active.baseUrl });
			} else if (active.kind === "google") {
				generated = await generateGoogleVideo({ ...shared, endpoint: active.baseUrl });
			} else {
				generated = await generateOpenAIVideo({ ...shared, baseURL: active.baseUrl });
			}
			return finishVideo(generated, { provider: active.id, model: active.model }, cfg, exec);
		},
		presentResult: (_args, result) => videoPresentation(result),
	}));

	// --- animate_image tool (image-to-video) ---
	ctx.tools.register(defineTool({
		name: "animate_image",
		description: "Generate one short video from a source image and a text prompt with the configured video provider. Use when the user asks to animate, bring to life, or create a video from an existing image. For a named workspace file, pass its exact path as source_path. For a specific image still attached to the current conversation, pass source_attachment_id. Never provide both. Omit both only when the user clearly means the newest conversation image. The source image is used as the starting frame or visual reference. Give a complete visual prompt: desired motion, camera movement, and any changes to the scene. Generation is asynchronous and may take one to several minutes. On success the video is streamed into the conversation and, with workspace saving enabled (the default), also written as a file whose absolute path is in the result's savedTo field. Do not call read, glob, or other tools to locate or verify the video.",
		parameters: {
			prompt: { type: "string", required: true, description: "Describe the motion and animation to apply to the source image." },
			source_attachment_id: { type: "string", description: "Optional attachment id of a specific image already present in the current conversation." },
			source_path: { type: "string", description: "Optional absolute or workspace-relative path of a specific image file inside the active session workspace. Prefer this when the user names a saved file." },
			size: { type: "string", description: "Optional resolution or aspect ratio, e.g. '1280*720' for DashScope or '16:9' for Seedance." },
			duration: { type: "integer", description: "Optional clip length in seconds (provider-dependent, e.g. 5 or 10)." },
			provider: { type: "string", description: "Optional video provider id from the configured catalog (must have i2v enabled); omit to use the selected default." },
			resubmit: { type: "boolean", description: "Optional; true forces a new task even when a previous task for the same prompt/provider/source is still tracked. Default false: a still-running tracked task is reported instead of resubmitting." },
		},
		output: {
			schema: VIDEO_OUTPUT_SCHEMA,
			render: (_args, value) => {
				const saved = typeof value.savedTo === "string"
					? ` It was also saved to the workspace as ${value.savedTo}.`
					: typeof value.saveError === "string"
						? ` Saving it to the workspace failed: ${value.saveError}.`
						: "";
				return [{
					type: "text",
					text: `Animated one video from a source image with ${value.provider}/${value.model} (${String(value.bytes)} bytes). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the video.`,
				}];
			},
			presentationMeta: (args, value) => ({
				kind: "dsh-video-gen",
				operation: "animate",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(value.attachment && typeof value.attachment === "object" ? { attachment: value.attachment } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				...(typeof args.duration === "number" ? { duration: args.duration } : {}),
				prompt: args.prompt,
			}),
		},
		timeoutMs: (current().waitTimeoutMs ?? 600000) + 60000,
		async execute(args, exec) {
			const cfg = current();
			if (cfg.videoEnabled === false) {
				throw new Error("animate_image: 视频工具已停用（设置 → 插件 → 插件配置 → dsh-media-gen → 视频生成）。");
			}
			const active = resolveVideoEntry(cfg, args.provider);

			// i2v 能力由目录条目决定：原生三家 kind 默认支持；openai-compatible 需显式开启（input_reference data URL 路径）
			if (!active.i2v) {
				throw new Error(`animate_image: 视频供应商 "${active.id}" 未开启图生视频(i2v)。请在 设置 → 插件 → 插件配置 → dsh-media-gen → 视频生成 中勾选该供应商的 i2v，或改用/指定支持 i2v 的供应商。`);
			}

			const credential = await ctx.credentials.resolve(credentialRef(active.apiKeyEnv));
			if (credential === undefined || credential.value.length === 0) {
				throw new Error(`animate_image requires the ${active.apiKeyEnv} credential; configure it in Settings → Plugins → dsh-media-gen → Video generation.`);
			}
			const rateLimit = { baseMs: cfg.rateLimitBaseMs ?? 60000, maxRetries: cfg.rateLimitMaxRetries ?? 3 };
			let taskKey;
			if (active.kind === "openai-compatible") {
				// 纪律：先查旧任务再决定重提（源图标签参与任务键）
				const sourceTag = args.source_path ?? args.source_attachment_id ?? "newest";
				taskKey = taskKeyFor(active.id, "i2v", args.prompt, sourceTag);
				const tracked = args.resubmit === true ? undefined : trackedTask(taskKey);
				if (tracked !== undefined) {
					const state = await queryOpenAITaskState(active.baseUrl, tracked.taskId, { apiKey: credential.value, signal: exec.signal, rateLimit }).catch(() => undefined);
					const decision = state === undefined ? "blocked" : decideTrackedTask(state);
					if (decision === "reuse") {
						const reused = await collectOpenAICompletion(active.baseUrl, tracked.taskId, state, { maxBytes: DEFAULT_MAX_VIDEO_BYTES, signal: exec.signal });
						forgetTask(taskKey);
						return finishVideo(reused, { provider: active.id, model: active.model }, cfg, exec);
					}
					if (decision === "blocked") {
						throw new Error(`旧任务 ${tracked.taskId} 仍为 ${describeTrackedTask(state)}；为避免加重上游淤积未重提。请稍后重试（完成后将直接取其结果），或传 resubmit=true 强制新任务。`);
					}
					forgetTask(taskKey);
				}
			}

			// Resolve the source image
			const sourceImage = await resolveReferenceImage({
				sourceAttachmentId: args.source_attachment_id,
				sourcePath: args.source_path,
				workspaceRoot: exec.agent?.session.header.cwd,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				signal: exec.signal,
				conversationImages: collectConversationImages(exec.agent),
				readImage: async (ref, signal) => {
					const stored = await ctx.attachments.readImage(ref, signal ?? exec.signal);
					return { data: stored.data, mediaType: stored.ref.mediaType };
				},
			});

			if (sourceImage === undefined) {
				throw new Error("animate_image requires a source image. Provide source_path (workspace file) or source_attachment_id (conversation image), or ensure there is an image in the current conversation.");
			}

			const shared = {
				apiKey: credential.value,
				model: active.model,
				prompt: args.prompt,
				sourceImage,
				size: args.size,
				duration: args.duration,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				pollIntervalMs: cfg.pollIntervalMs ?? 5000,
				waitTimeoutMs: cfg.waitTimeoutMs ?? 600000,
				signal: exec.signal,
				rateLimit,
				taskKey,
			};

			let generated;
			if (active.kind === "dashscope") {
				generated = await animateDashScopeVideo({ ...shared, endpoint: active.baseUrl });
			} else if (active.kind === "volcengine") {
				generated = await animateVolcengineVideo({ ...shared, baseURL: active.baseUrl });
			} else if (active.kind === "google") {
				generated = await animateGoogleVideo({ ...shared, endpoint: active.baseUrl });
			} else {
				generated = await animateOpenAIVideo({ ...shared, baseURL: active.baseUrl });
			}
			return finishVideo(generated, { provider: active.id, model: active.model }, cfg, exec);
		},
		presentResult: (_args, result) => videoPresentation(result),
	}));
}

// Exported for tests and advanced integrations; the plugin wiring above is the
// primary surface.
export {
	serveVideo,
	readPersistedVideo,
	upsertWorkspaceMarker,
	readWorkspaceMarkerEntry,
	cacheVideo,
	rememberWorkspaceRoot,
	saveVideoToWorkspace,
	finishVideo,
};

/** Drop every in-memory video byte and trusted workspace root (test helper). */
export function __resetVideoRouteStateForTests() {
	videoCache.clear();
	knownWorkspaceRoots.clear();
}
//#endregion