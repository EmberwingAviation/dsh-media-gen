/**
 * scripts/smoke-runninghub.mjs — RunningHub 通道手动冒烟测试。
 *
 * 会**真实提交任务并扣 RH 余额**（默认 1.05 元档：kling-v2.6-std/text-to-video 5s 9:16），
 * 因此不放进 `npm test`，只在改完 adapter / 同步上游后手动跑一次。
 *
 * 用法：
 *   $env:RH_KEY_SHARED = "..."          # 或用 --key
 *   node scripts/smoke-runninghub.mjs "电影感镜头：雨夜街头，镜头推近"
 *   node scripts/smoke-runninghub.mjs "..." kling-v2.6-std/text-to-video
 *
 * 输出：./smoke-runninghub.mp4（可用 --out 指定）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { generateRunningHubVideo } from "../lib/video-runninghub.js";

const args = process.argv.slice(2);
const prompt = args[0] ?? "电影感镜头：雨夜霓虹街头，人物撑伞缓步前行，镜头缓慢推近，浅景深，真实光影";
const model = args[1] ?? "kling-v2.6-std/text-to-video";
const outIndex = args.indexOf("--out");
const outFile = resolve(outIndex >= 0 ? args[outIndex + 1] : "smoke-runninghub.mp4");
const apiKey = process.env.RH_KEY_SHARED?.trim();
if (!apiKey) {
	console.error("缺少 RH_KEY_SHARED；先设置环境变量，或改用 rh-models-media skill 的 rh.py");
	process.exit(2);
}

console.log(`[smoke] model=${model}\n[smoke] prompt=${prompt}\n[smoke] out=${outFile}`);
const started = Date.now();
const result = await generateRunningHubVideo({
	baseUrl: "https://www.runninghub.cn",
	apiKey,
	model,
	prompt,
	size: "720*1280",
	duration: 5,
	pollIntervalMs: 8000,
	waitTimeoutMs: 900000,
	maxBytes: 200 * 1024 * 1024,
	onTaskId: (taskId) => console.log(`[smoke] taskId=${taskId}`),
});
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, result.data);
console.log(JSON.stringify({
	file: outFile,
	bytes: result.data.length,
	mediaType: result.mediaType,
	sourceUrl: result.sourceUrl,
	elapsedSec: Math.round((Date.now() - started) / 1000),
}, null, 2));
