# 服务器与 Harness 接手指南

更新日期：2026-10-16。当前应用版本 1.7.11，主数据库 schema v3，完整备份格式 v1。

## 获取完整开发工程

源码仓库已由所有者明确公开：https://github.com/fly-01-hub/Mind-map 。此决定优先于 `redme.txt` 历史快照中“源码必须私有”的要求。不要自动改变仓库可见性。

在已安装 Git、Node.js 24 和 npm 的服务器上执行：

```bash
git clone https://github.com/fly-01-hub/Mind-map.git
cd Mind-map
git rev-parse HEAD
node --version
npm ci
npm run typecheck
npm test
npm run lint
npm run build
```

已有检出目录时，先检查 `git status`，保留服务器自己的改动，再使用 `git pull --ff-only` 更新；不要直接清空目录或强制覆盖分支。依赖版本由 `package-lock.json` 固定。

仅运行网页的 Linux 服务器不需要 Electron 图形环境，可以用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` 安装依赖；Windows 安装包另在 Windows 环境构建，安卓包按 `docs/ANDROID.md` 构建。

本地验证网页：

```bash
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

这会在服务器回环地址启动网页。远程访问需要用户已有的 SSH 隧道或正式部署方案；此命令不会自动开放网络端口。生产 HTTPS 与局域网部署另见 `docs/LAN.md`。

## 先理解现有资料保存位置

- React、TypeScript、Vite、Zustand、Dexie/IndexedDB、Mind Elixir、PDF.js 构成应用主体。
- 网页/PWA、Electron Windows 版和安卓分别保存资料；仅克隆源码或启动服务器网页不会同步笔记本上的导图。
- `src/types/mindmap.ts` 的 NodeData 是导图/大纲共用数据模型；`src/stores/documentStore.ts` 统一处理树操作和撤销。
- `src/services/persistence/` 与 `src/repositories/` 负责草稿恢复、冲突检测和本地持久化。不要绕开它们直接改用户数据库。
- PDF、批注与节点关联见 `docs/PDF_KNOWLEDGE.md`、`src/services/paper/` 和 `src/services/pdf/`。
- 完整 `.researchmind` 恢复会替换目标知识库，不是增量导入或同步接口。

不要把笔记本的个人资料、数据库或应用配置目录上传到本仓库。服务器开发和测试使用合成数据及独立临时配置。

## 待实现的文献检索功能

当前 AIProvider 和 PaperAIProvider 仍为离线 Mock。仓库尚未接入 Harness、千问或真实联网文献搜索；不要将未来方案描述为已交付功能。

用户目标：服务器上的 Harness 使用其已配置的模型及检索工具，执行大范围文献检索、去重、核实来源和主题整理；笔记本的网页/PWA 与 Windows 客户端获取结果并保存为便于查阅的思维导图。

建议先确认实际 Harness 版本、鉴权方式、模型和检索工具，再实现任务接口。网页首页地址和访问 token 不等同于已经存在可调用的任务 API。

结果应保留标题、作者、年份、DOI/原文链接、检索时间和阅读依据（元数据、摘要或全文）。缺失信息应明确缺失，不编造来源、页码或全文结论。依据 DOI 或稳定来源标识去重，任务支持进度、失败恢复和重复接收去重。

服务器保留任务与结果，客户端通过接收入口新增导图或追加指定分支，沿用现有保存机制。任务执行和结果取回应允许分离，以便笔记本离线后重开继续接收。两种客户端接入同一个任务服务，不代表它们已有的全部知识库会自动同步。

开发前依次阅读 `README.md`、`redme.txt`、`docs/ARCHITECTURE.md`、`docs/DATA_MODEL.md` 和 `docs/DATA_SAFETY.md`。优先使用当前用户指令与最新接手说明；旧交接中的进程、证书、发布、Git 状态和授权是历史快照。

保留所有已有资料；不清空数据库，不更改用户现有来源/配置，不自动恢复备份或发布版本。完成实现后在隔离环境验证检索到接收导图的完整流程，并如实记录尚未通过的远端联调。
