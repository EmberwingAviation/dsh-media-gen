/**
 * dsh-media-gen — 生视频 host 核心。
 * 复制自 dsh-video-gen@0.2.4（MIT © Yang-wudi，见 ../NOTICE.md）并适配：
 *   - 移除 settings 接线（settingsScope/installSection）；配置由合并入口的 volatile Config reader 提供
 *   - 单 provider 激活升级为多供应商目录（resolveVideoEntry + 工具 per-call provider 参数）
 *   - openai-compatible kind 新增图生视频（input_reference data URL，实测中转站转存 OSS 后转发上游）
 */
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { randomUUID, createHash } from "node:crypto";
import { homedir } from "node:os";
import { VideoTaskEngine, videoTaskResult } from './video-task-engine.js';
import { VideoTaskStore } from './video-task-store.js';
import { resolveModelParameters } from './video-model-config.js';
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
	VIDEO_ROUTE,
	DEFAULT_MAX_VIDEO_BYTES,
	delay,
	readBoundedText,
	downloadVideo,
	fetchCompletedVideo,
	submitVideoTask,
} from "./video-shared.js";
import { resolveVideoEntry, DEFAULT_POLL_INTERVAL_MS, DEFAULT_WAIT_TIMEOUT_MS } from "./media-config.js";
import { retryOnRateLimit, tagRateLimit } from "./rate-limit.js";
import { describeUpstreamError, requestIdFromHeaders } from "./upstream-error.js";
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
			throw tagRateLimit(new Error(describeUpstreamError("DashScope video task creation failed", response.status, text, requestIdFromHeaders(response.headers))), { status: response.status, payload: parsed });
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
			throw tagRateLimit(new Error(describeUpstreamError("DashScope video task creation failed", response.status, text, requestIdFromHeaders(response.headers))), { status: response.status, payload: parsed });
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
	const taskId = submitJson?.output?.task_id;
	if (typeof taskId !== "string" || taskId.trim().length === 0) throw new Error(`DashScope did not return a task_id: ${submitText.slice(0, ERROR_LIMIT)}`);

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
			if (!poll.ok) throw tagRateLimit(new Error(describeUpstreamError("DashScope task poll failed", poll.status, pollText, requestIdFromHeaders(poll.headers))), { status: poll.status, payload: parsed });
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
		if (!submit.ok) throw tagRateLimit(new Error(describeUpstreamError("Volcengine video task creation failed", submit.status, submitText, requestIdFromHeaders(submit.headers))), { status: submit.status, payload: parsed });
		if (parsed === undefined) throw new Error("Volcengine returned invalid JSON on task creation");
		return parsed;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "volcengine submit" });
	const taskId = submitJson?.id;
	if (typeof taskId !== "string" || taskId.trim().length === 0) throw new Error(`Volcengine did not return a task id: ${JSON.stringify(submitJson).slice(0, ERROR_LIMIT)}`);

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
			if (!poll.ok) throw tagRateLimit(new Error(describeUpstreamError("Volcengine task poll failed", poll.status, pollText, requestIdFromHeaders(poll.headers))), { status: poll.status, payload: parsed });
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
		if (!poll.ok) throw tagRateLimit(new Error(describeUpstreamError("OpenAI video task poll failed", poll.status, pollText, requestIdFromHeaders(poll.headers))), { status: poll.status, payload: pollJson });
		return pollJson;
	}, { signal: input.signal, baseMs: input.rateLimit?.baseMs, maxRetries: input.rateLimit?.maxRetries, label: "video poll" });
}

/**
 * 把 completed 轮询结果取成视频字节。
 * 实际策略（content 优先 / URL 兜底）在 video-shared.js 的 fetchCompletedVideo 里，
 * 那边无宿主依赖、可被单测直接覆盖。
 */
function collectOpenAICompletion(base, taskId, pollJson, input) {
	return fetchCompletedVideo({
		base,
		taskId,
		pollJson,
		apiKey: input.apiKey,
		maxBytes: input.maxBytes,
		signal: input.signal,
	});
}

async function generateOpenAIVideo(input) {
	const base = input.baseURL.endsWith("/") ? input.baseURL.slice(0, -1) : input.baseURL;
	// 提交（含两层正交退避：派发失败 15s/30s、限流 ≥60s）在 video-shared.js 里，
	// 那边无宿主依赖，可用本地假中转直接单测。
	const submitJson = await submitVideoTask({
		base,
		apiKey: input.apiKey,
		model: input.model,
		prompt: input.prompt,
		size: input.size,
		duration: input.duration,
		inputReference: input.inputReference,
		signal: input.signal,
		rateLimit: input.rateLimit,
	});
	// task_id 是 New API 的旧客户端兼容字段（文档第八章：当前与 id 相同）；只回 task_id 的中转也要能用
	const taskId = typeof submitJson?.id === "string" && submitJson.id.trim().length > 0 ? submitJson.id : submitJson?.task_id;
	if (typeof taskId !== "string" || taskId.trim().length === 0) throw new Error(`OpenAI did not return a video task id: ${JSON.stringify(submitJson).slice(0, ERROR_LIMIT)}`);
	if (input.taskKey) rememberTask(input.taskKey, taskId);

	const deadline = Date.now() + input.waitTimeoutMs;
	// 文档第八章：`unknown` = 未识别到上游状态 → 降低轮询频率、稍后重查。
	// 连续未知时把有效间隔翻倍（上限 60s）；看到 queued/in_progress 立刻恢复原间隔。
	let unrecognizedStreak = 0;
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
		const waitMs = unrecognizedStreak === 0
			? input.pollIntervalMs
			: Math.min(input.pollIntervalMs * 2 ** unrecognizedStreak, 60000);
		await delay(waitMs, input.signal);
		const pollJson = await queryOpenAITaskState(base, taskId, input);
		const status = pollJson.status;
		if (status === "completed") {
			if (input.taskKey) forgetTask(input.taskKey);
			return collectOpenAICompletion(base, taskId, pollJson, input);
		}
		if (status === "failed" || status === "cancelled" || status === "error") {
			if (input.taskKey) forgetTask(input.taskKey);
			throw new Error(`OpenAI video task ${status}: ${pollJson.error?.message ?? JSON.stringify(pollJson).slice(0, ERROR_LIMIT)}`);
		}
		unrecognizedStreak = status === "queued" || status === "in_progress" ? 0 : unrecognizedStreak + 1;
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

export const VIDEO_OUTPUT_SCHEMA = {
 type: 'object', additionalProperties: false,
 properties: Object.fromEntries([
  ...['provider','model','status','operationId','taskId','lastKnownStatus','observedAt','failedStage','message','error','nextAction','videoId','mediaType','route','sourceUrl','savedTo','saveError'].map(k => [k,{type:'string'}]),
  ['bytes',{type:'integer'}], ['progress',{type:'number'}],
  ['attachment',{type:'object',additionalProperties:false,properties:{videoId:{type:'string',required:true},savedTo:{type:'string',required:true},mediaType:{type:'string',required:true}}}],
 ]),
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
	if (meta.status && meta.status !== 'completed') return undefined;
	if (typeof meta.route !== "string") return undefined;
	return {
		card: "generic",
		title: "Generated video",
		content: [{ type: "text", text: `Video generated with ${meta.provider}/${meta.model}.` }],
	};
}

// settings 接线已移除：DSH >= 0.1.6 的配置面由 volatile Config（lib/media-config.js）
// + client configForms（lib/client-video.js）提供，不再需要 settingsScope/installSection。

/** Register persistent generation, recovery and model management tools. */
export function applyVideo(ctx, getConfig, extensions = {}) {
 const current = getConfig;
 const store = extensions.taskStore ?? new VideoTaskStore({ directory: join(process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh'), 'data', 'dsh-media-gen', 'tasks') });
 const engine = extensions.taskEngine ?? new VideoTaskEngine({ store,
  resolveCredential: async ref => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
  collect: (generated, active, context) => finishVideo(generated, {provider:active.id,model:active.model}, current(), context.exec),
 });
 const context = exec => ({workspace:exec.agent?.session?.header?.cwd,sessionId:exec.agent?.session?.header?.id,signal:exec.signal,exec});
 ctx.effect(() => ctx.webServer.register({kind:'exact',path:VIDEO_ROUTE,handler:serveVideo}), 'dsh-media-gen: video route');
 const withRoute = value => value.attachment?.videoId && !value.route ? {...value,videoId:value.attachment.videoId,mediaType:value.attachment.mediaType,route:`${VIDEO_ROUTE}?id=${encodeURIComponent(value.attachment.videoId)}`} : value;
 const sharedParameters = {
  provider:{type:'string',description:'Catalog provider ID; omit for the configured default.'},
  model:{type:'string',description:'Model ID within the selected provider; omit for its default. Discover IDs with manage_video_models action list.'},
  size:{type:'string',description:'Legacy dimensions or aspect ratio; omit to inherit model settings.'},
  duration:{type:'integer',description:'Duration in seconds; omit to inherit model settings.'},
  resolution:{type:'string',description:'Model-supported resolution, such as 720p or 1080p.'},
  aspect_ratio:{type:'string',description:'Model-supported aspect ratio, such as 16:9.'},
  generate_audio:{type:'boolean',description:'Whether to generate audio; omit to inherit model settings.'},
  resubmit:{type:'boolean',description:'Default false. Set true only when the user explicitly requests a new paid task rather than recovery.'},
 };
 const output = {
  schema: VIDEO_OUTPUT_SCHEMA,
  render: (_args,value) => [{type:'text',text: value.status && value.status !== 'completed'
   ? JSON.stringify(value)
   : value.route ? 'Generated video is attached.' + (value.savedTo ? ' Saved to '+value.savedTo+'.' : '') + (value.message ? ' '+value.message : '')
   : JSON.stringify(value)}],
  presentationMeta: (args,value) => ({kind:'dsh-video-gen',...withRoute(value),...(args.prompt ? {prompt:args.prompt} : {})}),
 };
 for (const animate of [false,true]) {
  ctx.tools.register(defineTool({
   name: animate ? 'animate_image' : 'generate_video',
   description: animate
    ? 'Create a video from an existing image when the user asks to animate it. Returns a pending operation or completed video; recover pending work with query_video_task, not a new submission.'
    : 'Create a video only when the user requests one. Returns a pending operation or completed video; recover pending work with query_video_task, not a new submission.',
   parameters: {prompt:{type:'string',required:true,description:animate ? 'Desired motion, camera movement and scene changes.' : 'Complete visual prompt: subject, action, camera, setting, mood and style.'},...sharedParameters,
    ...(animate ? {source_path:{type:'string',description:'Exact workspace image path. Do not combine with source_attachment_id; omit both only for the newest conversation image.'},source_attachment_id:{type:'string',description:'Conversation image attachment ID, instead of source_path.'}} : {})},
   output, timeoutMs:(current().waitTimeoutMs ?? 600000)+60000,
   async execute(args,exec) {
    const cfg=current();
    if(cfg.videoEnabled===false) throw new Error('Video generation is disabled in settings.');
    const active=resolveVideoEntry(cfg,args.provider,args.model);
    if(animate ? !active.capabilities.i2v : !active.capabilities.t2v) throw new Error('Selected model does not support '+(animate?'i2v':'t2v'));
    const resolved=resolveModelParameters(active.providerConfig,active.modelConfig,{size:args.size,duration:args.duration,resolution:args.resolution,aspectRatio:args.aspect_ratio,generateAudio:args.generate_audio});
    Object.assign(active,{parameters:resolved.parameters,parameterSources:resolved.sources,omittedParameters:resolved.omitted});
    let sourceImage;
    if(animate) {
     sourceImage=await resolveReferenceImage({sourceAttachmentId:args.source_attachment_id,sourcePath:args.source_path,workspaceRoot:exec.agent?.session?.header?.cwd,maxBytes:DEFAULT_MAX_VIDEO_BYTES,signal:exec.signal,conversationImages:collectConversationImages(exec.agent),readImage:async(ref,signal)=>{const stored=await ctx.attachments.readImage(ref,signal??exec.signal);return {data:stored.data,mediaType:stored.ref.mediaType};}});
     if(!sourceImage) throw new Error('animate_image requires a source image.');
    }
    const legacy=active.protocol==='google';
    if(!legacy) return engine.generate(active,{prompt:args.prompt,operation:animate?'i2v':'t2v',resubmit:args.resubmit===true,...(sourceImage?{sourceUrl:'data:'+sourceImage.mediaType+';base64,'+Buffer.from(sourceImage.data).toString('base64'),sourceIdentity:createHash('sha256').update(sourceImage.data).digest('hex')}:{})},context(exec));
    const unsupported=Object.keys(active.parameters);
    if(unsupported.length) throw new Error('Legacy Google adapter does not support configured parameters: '+unsupported.join(', '));
    return engine.generateLegacy(active,{prompt:args.prompt,operation:animate?'i2v':'t2v',resubmit:args.resubmit===true,...(sourceImage?{sourceIdentity:createHash('sha256').update(sourceImage.data).digest('hex')}:{})},context(exec),apiKey=>(animate?animateGoogleVideo:generateGoogleVideo)({apiKey,model:active.model,prompt:args.prompt,sourceImage,endpoint:active.baseUrl,maxBytes:DEFAULT_MAX_VIDEO_BYTES,signal:exec.signal}));
   },presentResult:(_args,result)=>videoPresentation(result),
  }));
 }
 ctx.tools.register(defineTool({name:'query_video_task',timeoutMs:300000,description:'List saved video operations or query an existing task and recover its completed download. Never submits a new paid generation.',
  parameters:{action:{type:'string',enum:['list','get'],required:true},operation_id:{type:'string',description:'Local operation ID returned by generation; preferred for get.'},task_id:{type:'string',description:'Upstream task ID, instead of operation_id.'}},
  output:{schema:{...VIDEO_OUTPUT_SCHEMA,properties:{...VIDEO_OUTPUT_SCHEMA.properties,tasks:{type:'array',items:VIDEO_OUTPUT_SCHEMA}}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}],presentationMeta:(_args,value)=>({kind:'dsh-video-gen',...withRoute(value)})},
  async execute(args,exec){
   if(args.action==='list') return {tasks:(await store.list({limit:50})).map(row=>videoTaskResult({...row,provider:row.provider??row.providerId}))};
   if(args.action!=='get') throw new Error('Unknown video task action.');
   if(args.operation_id&&args.task_id) throw new Error('Provide only operation_id or task_id.');
   let id=args.operation_id;
   if(!id&&args.task_id){const record=await store.findByTaskId(args.task_id);if(!record)throw new Error('Task ID is unknown or ambiguous; use operation_id.');id=record.operationId;}
   if(!id) throw new Error('get requires operation_id or task_id.');
   return engine.query(id,context(exec));
  },presentResult:(_args,result)=>videoPresentation(result),
 }));
 ctx.tools.register(defineTool({name:'manage_video_models',description:'List video models and revision, preview requests without sending them, or edit model configuration. Changes affect the shared profile. Never pass API keys; mutations require the revision returned by list.',
  parameters:{action:{type:'string',enum:['list','preview','upsert','remove','set_default'],required:true},provider:{type:'string',description:'Provider ID.'},model:{type:'string',description:'For preview: model ID. For upsert: JSON model object with id,name,protocol,parameterFormat,overrides,capabilities; no credentials.'},model_id:{type:'string',description:'Model ID for remove or set_default.'},expected_revision:{type:'string',description:'Revision returned by list; required for mutations.'},make_provider_default:{type:'boolean',description:'For set_default, also make this provider the global default.'}},
  output:{schema:{type:'object',additionalProperties:true,properties:{}},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  async execute(args){if(!extensions.videoModels)throw new Error('Model management unavailable');let model=args.model;if(args.action==='upsert'){model=JSON.parse(args.model);const allowed=['id','name','protocol','parameterFormat','overrides','capabilities'];if(!model||Array.isArray(model)||typeof model!=='object'||Object.keys(model).some(k=>!allowed.includes(k)))throw new Error('Invalid model fields; credentials are not accepted.');const rejectSecrets=value=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(/^(api[_-]?key|authorization|credential|credentials|secret|token|access[_-]?token)$/i.test(key))throw new Error('Model credentials are not accepted.');rejectSecrets(item);}};rejectSecrets(model);}return extensions.videoModels({action:args.action,provider:args.provider,model,modelId:args.model_id,expectedRevision:args.expected_revision,makeProviderDefault:args.make_provider_default});},
 }));
}

// Exported for tests and advanced integrations; the plugin wiring above is the
// primary surface.
export {
	generateVolcengineVideo,
	generateOpenAIVideo,
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