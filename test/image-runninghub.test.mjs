import assert from "node:assert/strict";
import test from "node:test";

import {
	buildRunningHubImagePayload,
	isEditRoute,
	needsSubmodel,
	normalizeRunningHubImageRoute,
	pixelSize,
} from "../lib/image-runninghub.js";

test("图像路由规整：默认值与前缀处理", () => {
	assert.equal(normalizeRunningHubImageRoute(""), "seedream-v5-pro/text-to-image");
	assert.equal(normalizeRunningHubImageRoute("/openapi/v2/rhart-image-g/text-to-image"), "rhart-image-g/text-to-image");
	assert.throws(() => normalizeRunningHubImageRoute("openapi/v2/query"), /不能是/);
});

test("rhart-image-g 需要子版本，其它不需要", () => {
	assert.equal(needsSubmodel("rhart-image-g/text-to-image"), true);
	assert.equal(needsSubmodel("rhart-image-g/image-to-image"), true);
	assert.equal(needsSubmodel("seedream-v5-pro/text-to-image"), false);
});

test("编辑类路由识别", () => {
	assert.equal(isEditRoute("rhart-image-g/image-to-image"), true);
	assert.equal(isEditRoute("seedream-v5-pro/image-to-image"), true);
	assert.equal(isEditRoute("alibaba/qwen-image-3.0/image-edit"), true);
	assert.equal(isEditRoute("rhart-image-g/text-to-image"), false);
});

test("尺寸解析与不同模型的尺寸字段", () => {
	assert.deepEqual(pixelSize("1024x1536"), { width: 1024, height: 1536 });
	assert.equal(pixelSize("auto"), undefined);

	// rhart 系列的 aspectRatio 是像素串（真实 API 枚举：960x960 / 720x1280 / 1280x720 ...）
	assert.deepEqual(buildRunningHubImagePayload("rhart-image-g/text-to-image", {
		prompt: "雨夜街头",
		size: "1024x1024",
	}), { prompt: "雨夜街头", model: "g-4.2", aspectRatio: "960x960" });
	assert.equal(
		buildRunningHubImagePayload("rhart-image-g/text-to-image", { prompt: "x", size: "720x1280" }).aspectRatio,
		"720x1280",
	);

	// seedream 用 width/height
	assert.deepEqual(buildRunningHubImagePayload("seedream-v5-pro/text-to-image", {
		prompt: "海报",
		size: "1024x1536",
	}), { prompt: "海报", width: 1024, height: 1536 });

	// 千问用 size 字符串
	assert.deepEqual(buildRunningHubImagePayload("alibaba/qwen-image-3.0-pro/text-to-image", {
		prompt: "海报",
		size: "1536x1024",
	}), { prompt: "海报", size: "1536x1024" });
});
