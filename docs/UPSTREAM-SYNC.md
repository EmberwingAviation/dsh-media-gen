# 上游同步策略（fork 维护手册）

本仓库是 [EmberwingAviation/dsh-media-gen](https://github.com/EmberwingAviation/dsh-media-gen) 的 fork，
在 `feat/runninghub` 分支上增加了 **RunningHub 标准模型 API** 视频通道。
本文件说明：上游更新时，如何拿到新代码而**不丢**我们的改动。

## 分支模型

| 分支 | 内容 | 规则 |
|---|---|---|
| `main` | **等于上游**，不提交任何本地改动 | 每次同步 `reset --hard upstream/main` |
| `feat/runninghub` | 我们的改动（RH 视频通道） | 基于 `main`，长期维护 |
| `upstream/main` | 上游镜像（remote） | 只 fetch，不 push |

安装给 DSH 用的是 `feat/runninghub` 分支：

```sh
dsh plugin --profile desktop add github:TonyQ-AI/dsh-media-gen#feat/runninghub
```

## 日常同步（一条命令）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-upstream.ps1
```

脚本做四件事：

1. `git fetch upstream`
2. `main` 重置到 `upstream/main` 并推到 fork（让 fork 的 main 也是干净的镜像）
3. 切回 `feat/runninghub`，`git rebase main`
4. `npm run check` + `npm test`（含 RH 的 7 个回归测试）

手工等价命令：

```sh
git fetch upstream
git checkout main
git reset --hard upstream/main
git push origin main
git checkout feat/runninghub
git rebase main
npm run check && npm test
```

## 为什么冲突面很小

我们的改动被刻意切成"新文件 + 极薄接线"：

| 文件 | 改动性质 | 上游改它时的冲突概率 |
|---|---|---|
| `lib/video-runninghub.js` | **新增文件**，全部 RH 逻辑 | 0（上游没有这个文件） |
| `lib/video-core.js` | import 1 行 + 两处 `else if (kind === "runninghub")` 各 1 行 | 低 |
| `lib/media-config.js` | 三个常量表各加 1 条 | 低 |
| `lib/client-video.js` | 常量/默认值/下拉各加 1 条 | 中（UI 常被上游改） |
| `lib/client.js` | **构建产物**，由 `scripts/build-client.mjs` 生成 | 不手改，跑构建 |

所以即使 `client-video.js` 冲突，解法固定：**保留上游结构，把 `runninghub` 那几行重新加进去**，然后 `node scripts/build-client.mjs`。

## rebase 冲突处理步骤

1. `git status` 看冲突文件；
2. `client.js` 的冲突**直接丢弃**（`git checkout --theirs lib/client.js` 或删掉冲突标记后重新构建）；
3. 其它文件保留两侧：上游的结构 + 我们的 `runninghub` 分支；
4. 重新构建并测试：
   ```sh
   node scripts/build-client.mjs
   npm run check
   npm test
   ```
5. `git rebase --continue`。

## 上游大改 provider 系统时（判断是否还值得跟）

先看 `lib/media-config.js` 里是否还有 `VIDEO_ENTRY_KINDS`：

- **还在** → 按上面的流程照旧 rebase。
- **被重构掉**（比如改成插件化 provider 注册）→ 两个选择：
  1. 把 RH 适配改成上游新扩展点（一次性改造，之后零冲突）；
  2. 退回「零侵入」方案：`openai-compatible` + 本地 shim（服务调 RunningHub 标准模型 API），
     或者干脆不用 media-gen，直接用 `rh-models-media` skill 的 `rh.py`。

## 升级后验证清单

- [ ] `npm run check` 通过（语法）
- [ ] `npm test` 通过（84 + 7 条；重点看 `video-runninghub.test.mjs`）
- [ ] 设置 → 插件 → 视频生成：类型下拉里有「RunningHub（标准模型 API）」
- [ ] 填一个 RH 供应商（Base URL 留空用默认、model 填路由、key 填 `RH_KEY_SHARED`）
- [ ] `generate_video` 出一条（会真的扣 RH 余额，先小额验证）
- [ ] 视频能内联播放、落 `generate/video/`

## 长期选项

- **提 PR 给上游**：RH 通道对其它用户也有用，合入后就不需要维护 fork（推荐，但需要上游接受）。
- **锁版本**：在 `package.json` 或安装命令里固定 commit，避免上游破坏性更新。
- **CI**：fork 的 Actions 默认需要手动启用；启用后每次同步都会自动跑测试。
