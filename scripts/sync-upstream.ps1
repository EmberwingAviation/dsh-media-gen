# 一键同步上游：main 跟随 upstream/main，再把 feat/runninghub rebase 过去，最后跑测试。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/sync-upstream.ps1 [-Branch feat/runninghub]
param(
    [string]$Branch = "feat/runninghub",
    [string]$Upstream = "upstream",
    [string]$Origin = "origin"
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Step "git fetch $Upstream"
git fetch $Upstream
if ($LASTEXITCODE -ne 0) { throw "fetch 失败（remote $Upstream 是否存在？）" }

Step "main <- $Upstream/main（fork 的 main 永远是上游镜像）"
git checkout main
git reset --hard "$Upstream/main"
git push $Origin main

Step "切回 $Branch 并 rebase 到 main"
git checkout $Branch
git rebase main
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n!! rebase 有冲突。处理建议：" -ForegroundColor Yellow
    Write-Host "   - lib/client.js 的冲突直接丢弃（构建产物）：git checkout --theirs lib/client.js"
    Write-Host "   - 其它文件保留上游结构 + 我们的 runninghub 分支"
    Write-Host "   - 解决后：node scripts/build-client.mjs; npm run check; npm test; git rebase --continue"
    throw "rebase 未完成"
}

Step "重建 client bundle（lib/client.js 是构建产物）"
node scripts/build-client.mjs
if ($LASTEXITCODE -ne 0) { throw "build-client 失败" }

Step "语法检查 + 全量测试"
npm run check
if ($LASTEXITCODE -ne 0) { throw "npm run check 失败" }
npm test
if ($LASTEXITCODE -ne 0) { throw "npm test 失败" }

Step "完成。推送到 fork：git push $Origin $Branch --force-with-lease"
Write-Host "提示：rebase 改写了历史，推送要用 --force-with-lease；装 DSH 用 github:TonyQ-AI/dsh-media-gen#$Branch" -ForegroundColor Green
