# 构建指南

本文档说明如何为不同平台构建 NarraFork 可执行文件。

## 快速开始

本地构建前请使用 Bun 1.4.2、安装 frozen 依赖，并设置临时 `NARRAFORK_HOME` 与 `NARRAFORK_ALLOW_MULTIPLE=1`（完整示例见“本地复现检查”），不要让构建脚本读取真实数据目录。

### 构建所有平台

```bash
bun run build:cross
```

产物文件名带版本号（`narrafork-${VERSION}-...`），覆盖 8 个平台：

- `dist/narrafork-${VERSION}-macos-arm64` — macOS Apple Silicon
- `dist/narrafork-${VERSION}-macos-x64` — macOS Intel
- `dist/narrafork-${VERSION}-linux-x64` / `-linux-x64-baseline` / `-linux-arm64`
- `dist/narrafork-${VERSION}-windows-x64.exe` / `-windows-x64-baseline.exe` / `-windows-arm64.exe`

### 按平台构建

```bash
# 构建所有 macOS / Linux / Windows 版本
bun run build:macos
bun run build:linux
bun run build:windows

# 单独构建特定平台
bun run build:macos-arm64
bun run build:macos-x64
bun run build:linux-x64
bun run build:linux-x64-baseline
bun run build:linux-arm64
```

`--platform=` 支持完整后缀（`darwin-arm64`、`linux-x64`、`windows-x64`）或短别名前缀（`windows`/`linux`/`darwin` 匹配对应 `*-*`）；裸 `arm64` 不会命中。

### 前置条件：已提交的 SQLite 迁移谱系

构建会把 `drizzle/meta/_journal.json` 及其引用的全部 SQL 嵌入二进制，缺失即失败。正式迁移（SQL、journal、snapshot）必须随源码提交；只允许已包含这些输入的 checkout 进入构建，不应该在构建前现场生成基线。当前改动尚待用户提交，未提交文件不会出现在 Actions checkout 中。

- `bun run db:bootstrap` — 一次性建立初始基线（`0000_narrafork_baseline`）。只在 `drizzle/` 完全不存在时运行；遇到任何已有条目（目录、文件、symlink/junction、断链）都拒绝，不提供 force/reset。本仓库已完成这一步，正常开发不会再用到。
- `bun run db:generate` — 修改 `server/db/schema.ts` 后生成增量迁移，并把新 SQL/snapshot/journal 一起提交。
- 已发布的迁移不可修改、重排或 squash；回退结构须追加补偿迁移。
- `drizzle/**/*.sql` 和 `drizzle/**/*.json` 通过 `.gitattributes` 固定 LF。运行时按 SQL 字节哈希识别迁移，换行转换会让同一迁移在不同平台被视为不同迁移。

## 在自己的 GitHub 仓库自构建

`.github/workflows/build-self.yml`（名称 `build-self`）从本仓库所选 ref 的源码编译 8 个目标，产物以该次运行的 Actions Artifacts 交付。它不下载上游 NarraFork 成品，不 bump 版本，不创建 Tag/Release，不提交或推送（权限仅 `contents: read`，checkout 不保留凭据）。

### 触发

1. 把本功能的 workflow、脚本、测试以及 `drizzle/` 迁移一并提交、推送到自己的仓库；workflow 首次需进入默认分支，才能使用手动触发入口。
2. Actions → `build-self` → Run workflow，选择分支。没有其他输入参数；源码固定为该 ref 解析出的 commit（`github.sha`）。
3. 如需按 Tag 构建，可用 GitHub CLI：`gh workflow run build-self.yml --ref <tag>`（在自己的仓库运行，Tag 对应源码也需包含 workflow）。这会触发远程运行；本任务尚未实际验证分支／Tag dispatch。
4. 版本号读取该 commit 的 `package.json`；同一版本重复构建靠 Artifact 名中的短 sha 和 run/attempt 区分。

### 流程与门禁

- `validate`（Linux）：Bun 1.4.2 + `bun install --frozen-lockfile`，隔离 `NARRAFORK_HOME`，`check-self-build.ts --mode=input` 校验已提交迁移谱系，`--mode=drift` 在临时副本中运行普通生成，若 schema 有未提交的迁移则失败，然后运行本功能的聚焦测试。
- `build`：三个家族并行（`fail-fast: false`），各自 `build-cross-platform.ts --platform=<家族> --strict`，再 `--mode=package` 校验每个目标的二进制、`.metadata.json`、`SHA256SUMS` 与 `checksums.txt`（版本、commit、平台、大小、SHA256/SHA512 全部一致），然后对宿主可运行的目标做启动 smoke。任一步失败，该家族不上传。
- `summary`：只有三家族全部成功才报告八目标成功；否则整次运行失败并标记 `PARTIAL OR FAILED RUN`，此时已上传的 Artifact 只代表各自通过校验的家族。

| 家族 | Runner | 目标 | 包 |
|------|--------|------|----|
| linux | ubuntu-latest | x64 / x64-baseline / arm64 | `narrafork-${VERSION}-linux.tar.gz` |
| windows | windows-latest | x64 / x64-baseline / arm64 | `narrafork-${VERSION}-windows.zip` |
| darwin | macos-latest | arm64 / x64 | `narrafork-${VERSION}-macos.tar.gz` |

Artifact 名为 `narrafork-${VERSION}-<家族>-<短sha>-run<run_id>.<attempt>`，保留 14 天。每个 Artifact 内含该家族的压缩包和两份聚合校验和文件；压缩包内是该家族的可执行文件、各自的 `.metadata.json` 和同样两份校验和文件，不含前端目录、数据库或日志。

### 下载后使用

> 本地 Windows 三目标已在隔离源码副本中完成构建、ZIP 与身份校验；修正后的 x64 / x64-baseline 均通过真实首次／重复启动，x64 自有监听器冲突验证确认自然退出 1 且原监听器存活。显式 `--no-port-reclaim` 始终用于 smoke，禁止启动时扫描／终止端口占用者；不传时保留普通启动的原有回收行为。此证据来自 HEAD 加未提交任务改动，不等于已提交 checkout 或 GitHub Actions 验收；Windows ARM64 仅编译／静态验证，Linux/macOS 构建、签名及原生运行仍未验证。详细证据见任务的 `research/windows-final-check.md`。

Linux 示例（先进入解压目录，确保其中没有 `drizzle/` 或 `drizzle-postgres/`）：

```bash
VERSION='<填入产物版本号>'
# Artifact 下载后先解压外层 zip，再解压家族包（tar 保留可执行权限）
tar -xzf narrafork-${VERSION}-linux.tar.gz
sha256sum -c narrafork-${VERSION}-SHA256SUMS   # macOS: shasum -a 256 -c ...

# 首次运行：指定一个全新的绝对路径作为数据目录
export NARRAFORK_HOME="$HOME/narrafork-self/.narrafork"
./narrafork-${VERSION}-linux-x64
```

macOS 同理，解压 `macos.tar.gz`，用 `shasum -a 256 -c` 校验，并选择 `macos-arm64` 或 `macos-x64`。

Windows PowerShell 示例（`$VERSION` 填产物版本，先进入不含迁移目录的解压位置）：

```powershell
$VERSION = '<填入产物版本号>'
Expand-Archive "narrafork-$VERSION-windows.zip" -DestinationPath '.\self-build'
Set-Location '.\self-build'
# 按 SHA256SUMS 核对所选二进制的 SHA256
Get-FileHash "narrafork-$VERSION-windows-x64.exe" -Algorithm SHA256
$env:NARRAFORK_HOME = Join-Path $HOME 'narrafork-self\.narrafork'
& ".\narrafork-$VERSION-windows-x64.exe"
```

- GitHub Actions Artifact 本身不保留 Unix 可执行位，所以 Unix 产物用 `.tar.gz` 封装；请从解压出的文件运行。
- 数据目录：二进制默认使用 `~/.narrafork`，改名不会隔离数据。首次运行必须设置新的绝对 `NARRAFORK_HOME`，后续自建版本升级复用同一目录。不要指向上游或其他安装用过的目录：本仓库的迁移谱系从自己的基线开始，不保证能接管旧数据库，且目前没有自动拦截。
- 工作目录：运行时优先使用当前目录下的迁移，只在不存在时使用嵌入迁移。请在不含 `drizzle/` 和 `drizzle-postgres/` 的目录启动，不要在源码目录里运行下载的二进制。
- 升级：手动下载新版本替换可执行文件，继续使用同一 `NARRAFORK_HOME`。应用内更新源默认仍是 `NarraFork/NarraFork`（`server/lib/settings/update-source.ts`），自构建不会改变它；不要通过应用内更新把上游成品装进自建数据目录。
- 端口安全：共享机器上可显式传入 `--no-port-reclaim`（精确独立参数，不是 `--no-port-reclaim=true`），禁止启动时回收其他监听者。配合 `--port=<端口>` 时，占用即失败，不会终止占用进程或自动换端口；未显式指定端口时仍保留默认端口的候选回退。此参数不替代数据目录隔离，也不改变普通启动默认行为。
- 依赖：目标机需安装 Git；Podman 可选。
- 签名：macOS 仅 ad-hoc 签名（在 macOS runner 上 `codesign --verify` 校验），没有 Developer ID 或公证，首次运行可能需要 `xattr -d com.apple.quarantine`；Windows 产物未签名，可能触发 SmartScreen。

### 验证范围

smoke 只启动 runner 原生可执行的目标：全新 home、干净 CWD、`--no-auto-resume`、`--no-port-reclaim`、显式端口且仅监听 `127.0.0.1`，等待 `GET /api/health`，停止后对同一 home 再启动一次。即使选出的空闲端口在启动前被其他进程抢占，也只让本次 smoke 失败，不扫描／终止占用者或换端口。x64 宿主同时运行 x64 与 x64-baseline；不假设 Rosetta 或模拟器。其他架构只经过身份、metadata、校验和（及 macOS 签名）验证，不代表已在该架构原生运行。

### 本地复现检查

```bash
# 使用匹配 packageManager 的 Bun；本例为 Linux，macOS 家族参数改为 darwin
export NARRAFORK_HOME="$(mktemp -d)/.narrafork"
export NARRAFORK_ALLOW_MULTIPLE=1
bun --version  # 当前要求 1.4.2
bun install --frozen-lockfile
bun scripts/check-self-build.ts --mode=input
bun scripts/check-self-build.ts --mode=drift
bun scripts/build-cross-platform.ts --platform=linux --strict
bun scripts/check-self-build.ts --mode=package --family=linux
bun scripts/smoke-self-build.ts --family=linux
```

未设置 `NARRAFORK_HOME` 时，`check-self-build.ts` 会自行使用临时目录；直接构建脚本不会，所以必须先显式隔离。smoke 为每个目标创建独立 home，重复启动复用该 home；同时隔离系统 home、移除环境凭据，关闭可选插件／自动检查更新等后台集成。`--strict` 让缺失的 watcher 原生绑定、签名或 metadata 直接失败；不加时保持原来的宽松行为。

## 构建流程

构建脚本 `scripts/build-cross-platform.ts` 执行以下步骤：

1. **构建前端** — Vite 构建到 `dist/frontend/`
2. **下载 `@parcel/watcher` 原生二进制** — 8 个平台的 `.node`，绕过 node_modules
3. **生成嵌入清单/数据** — embedded-frontend、embedded-migrations、embedded-postgres-migrations、build-info、embedded-changelog、embedded-licenses
4. **编译可执行文件** — `bun build --compile` 为每个目标平台生成独立二进制
5. **生成校验和与更新元数据** — SHA256SUMS / checksums，以及更新服务器用的 `latest.yml`

## 高级用法

### 跳过前端构建

如果前端已经构建过，可以跳过这一步：

```bash
bun run build:cross --skip-frontend
```

### 指定特定平台

```bash
# 仅构建 Linux 版本
bun scripts/build-cross-platform.ts --platform=linux

# 仅构建某一平台（完整后缀如 linux-arm64 / darwin-arm64，或短别名 windows/linux/darwin）
bun scripts/build-cross-platform.ts --platform=linux-arm64
```

## 交叉编译说明

### 从 Linux x86 构建 macOS 版本

Bun 支持交叉编译，你可以在 Linux x86 机器上直接构建 macOS 版本：

```bash
bun run build:macos
```

生成目标为 macOS 可执行文件；交叉编译不等于运行验证，还需处理签名及 Gatekeeper。自构建 workflow 使用 macOS runner 完成 ad-hoc 签名和宿主架构 smoke。

### 注意事项

1. **内置依赖** - SQLite 通过 `bun:sqlite` 内置模块使用，已包含在编译后的二进制文件中
2. **外部依赖** - 目标系统需要安装：
   - Git（必需）
   - Podman（可选，用于容器功能）
3. **数据库位置** - 默认在 `~/.narrafork/narrafork.db`
4. **配置文件** - 默认在 `~/.narrafork/settings.json`

## 分发

编译后的可执行文件是完全独立的，包含：
- Bun 运行时
- 所有 Node.js 依赖
- 前端静态资源
- SQLite 数据库引擎

用户只需：
1. 下载对应平台的可执行文件
2. 添加执行权限（macOS/Linux）：`chmod +x narrafork-*`
3. 运行：`./narrafork-${VERSION}-macos-arm64`（文件名含版本号）

首次运行会自动（自构建产物请先设置新的 `NARRAFORK_HOME`，见上文）：
- 创建数据目录（默认 `~/.narrafork/`）
- 初始化数据库
- 生成默认配置

## 故障排查

### macOS Gatekeeper 警告

macOS 可能会阻止未签名的应用。用户需要：

```bash
# 移除隔离属性
xattr -d com.apple.quarantine narrafork-${VERSION}-macos-arm64

# 或在系统设置中允许运行
```

### 权限问题

确保可执行文件有执行权限：

```bash
chmod +x dist/narrafork-*
```

### 构建失败

1. 使用 `package.json` 中 `packageManager` 固定的 Bun 版本（当前 1.4.2）：`bun --version`
2. 若提示缺少 `drizzle/meta/_journal.json`，说明 checkout 不完整；迁移已纳入版本控制，不要用 `db:bootstrap` 现场重建
3. 清理并重试：
   ```bash
   rm -rf dist/ server/generated/
   bun run build:cross
   ```

## CI/CD 集成

直接使用仓库内的 `.github/workflows/build-self.yml`，见上文“在自己的 GitHub 仓库自构建”。它包含迁移校验、严格构建、产物校验、打包和 smoke；不要用只跑 `bun run build:cross` 的简化步骤替代，那样无法发现缺失目标或校验不一致。

## 相关命令

- `bun run build` — 仅构建前端
- `bun run build:cross` — 构建所有平台
- `bun run build:cross --platform=linux-x64` — 构建指定平台
- `bun run build:update-server` — 构建更新服务器
- `bun run build:android-rootfs` — 构建 Android rootfs
- `bun run start` — 生产模式运行（跑迁移 + 后端 + 静态前端，不编译独立二进制）
