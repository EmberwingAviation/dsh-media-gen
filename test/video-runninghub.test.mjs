import assert from "node:assert/strict";
import test from "node:test";

import {
	aspectRatioFromSize,
	buildRunningHubPayload,
	imageFieldForRoute,
	normalizeRunningHubRoute,
	submitRunningHubTask,
} from "../lib/video-runninghub.js";

test("路由规整：去掉 /openapi/v2 前缀与首尾斜杠", () => {
	assert.equal(normalizeRunningHubRoute("kling-v2.6-std/text-to-video"), "kling-v2.6-std/text-to-video");
	assert.equal(normalizeRunningHubRoute("/openapi/v2/kling-v2.6-std/text-to-video"), "kling-v2.6-std/text-to-video");
	assert.equal(normalizeRunningHubRoute("/kling-v2.6-std/text-to-video"), "kling-v2.6-std/text-to-video");
});

test("路由规整：空值与查询/上传路由直接拒绝", () => {
	assert.throws(() => normalizeRunningHubRoute(""), /未配置 model/);
	assert.throws(() => normalizeRunningHubRoute("openapi/v2/query"), /不能是/);
	assert.throws(() => normalizeRunningHubRoute("media/upload/binary"), /不能是/);
});

test("图片字段推断：精确表优先于启发式", () => {
	assert.equal(imageFieldForRoute("kling-v2.6-std/image-to-video"), "imageUrl");
	assert.equal(imageFieldForRoute("kling-v3.0-std/image-to-video"), "firstImageUrl");
	assert.equal(imageFieldForRoute("minimax/hailuo-h3/image-to-video"), "firstFrameUrl");
	assert.equal(imageFieldForRoute("alibaba/wan-3.0/image-to-video"), "firstFrameUrl");
	assert.equal(imageFieldForRoute("rhart-video-g/image-to-video"), "imageUrls");
	assert.equal(imageFieldForRoute("rhart-video-v3.1-pro-official/image-to-video"), "imageUrl");
	assert.equal(imageFieldForRoute("some-unknown/model"), "imageUrl");
});

test("画幅推断：像素对与比例都能归一", () => {
	assert.equal(aspectRatioFromSize("720*1280"), "9:16");
	assert.equal(aspectRatioFromSize("1280x720"), "16:9");
	assert.equal(aspectRatioFromSize("9:16"), "9:16");
	assert.equal(aspectRatioFromSize("1024x1024"), "1:1");
	assert.equal(aspectRatioFromSize(""), undefined);
	assert.equal(aspectRatioFromSize("auto"), undefined);
});

test("文生视频参数：prompt + duration + aspectRatio，不塞图片字段", () => {
	const payload = buildRunningHubPayload("kling-v2.6-std/text-to-video", {
		prompt: "雨夜街头，镜头推近",
		size: "720*1280",
		duration: 5,
	});
	assert.deepEqual(payload, {
		prompt: "雨夜街头，镜头推近",
		duration: "5",
		aspectRatio: "9:16",
	});
});

test("图生视频参数：按模型把源图放到正确字段", () => {
	const kling = buildRunningHubPayload("kling-v2.6-std/image-to-video", {
		prompt: "人物回望",
		sourceUrl: "https://example.com/a.jpg",
		duration: 5,
	});
	assert.equal(kling.imageUrl, "https://example.com/a.jpg");
	assert.equal(kling.duration, "5");

	const minimax = buildRunningHubPayload("minimax/hailuo-h3/image-to-video", {
		prompt: "人物回望",
		sourceUrl: "https://example.com/a.jpg",
	});
	assert.equal(minimax.firstFrameUrl, "https://example.com/a.jpg");

	const reference = buildRunningHubPayload("rhart-video-g/image-to-video", {
		prompt: "人物回望",
		sourceUrl: "https://example.com/a.jpg",
	});
	assert.deepEqual(reference.imageUrls, ["https://example.com/a.jpg"]);
});

test("提交走 /openapi/v2/<route>（回归：曾漏掉前缀导致 401）", async () => {
	const calls = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), body: init?.body });
		return new Response(JSON.stringify({ taskId: "t-1", status: "RUNNING" }), { status: 200 });
	};
	try {
		const taskId = await submitRunningHubTask({
			base: "https://www.runninghub.cn",
			apiKey: "k",
			route: "kling-v2.6-std/text-to-video",
			payload: { prompt: "x" },
		});
		assert.equal(taskId, "t-1");
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, "https://www.runninghub.cn/openapi/v2/kling-v2.6-std/text-to-video");
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("motion-control 明确拒绝（media-gen 不提供驱动视频）", async () => {
	const { generateRunningHubVideo } = await import("../lib/video-runninghub.js");
	await assert.rejects(
		generateRunningHubVideo({
			baseUrl: "https://www.runninghub.cn",
			apiKey: "k",
			model: "kling-v2.6-std/motion-control",
			prompt: "x",
			waitTimeoutMs: 1,
			pollIntervalMs: 1,
		}),
		/motion-control/,
	);
});
