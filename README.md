# ResearchMind 枝间

本地优先的思维导图、文档大纲与 PDF 阅读工具。当前源码版本 **1.7.16**，网页版支持多窗口同时打开、编辑不同导图，自动同步保存结果；同一导图的重复窗口先只读浏览，原编辑窗口关闭后自动接续。保留连线对齐修复、大容量备份及文献图解。公开下载发行仍为 1.7.11，未发布 1.7.12–1.7.16 安装包或安卓包。

[免费在线使用](https://fly-01-hub.github.io/Mind-map-download/) · [下载 Windows 安装包](https://github.com/fly-01-hub/Mind-map-download/releases/latest) · [服务器 / Harness 接手指南](docs/HARNESS_HANDOFF.md)。各自的资料保存在本机或浏览器中。发布维护见 [免费分发说明](docs/DISTRIBUTION.md)。

新对话中的 AI 接手请先阅读 [服务器 / Harness 接手指南](docs/HARNESS_HANDOFF.md)，再完整阅读 [redme.txt](redme.txt)。后者包含历次交接快照，接手时应重新核对 Git、进程与部署状态。2026-10-16 起，按仓库所有者的明确决定，源码仓库已公开；旧记录中的私有要求不再适用。

**首次打开是空白知识库**：不预置导图、文件夹、论文、附件或历史记录。已有用户升级不会被清空；只有主动新建或导入备份才会出现内容。无需账号、云数据库或付费 API。

## 下载与运行

Windows 安装包及面向用户的完整教程见 [公开下载仓库 Mind-map-download](https://github.com/fly-01-hub/Mind-map-download)，或直接打开 [公开 GitHub Releases](https://github.com/fly-01-hub/Mind-map-download/releases/latest)，选择 `ResearchMind-Setup-1.7.11-x64.exe`。

安卓平板：[下载 ResearchMind 1.7.11 APK](https://github.com/fly-01-hub/Mind-map-download/releases/download/v1.7.11/ResearchMind-1.7.11-android.apk)，Android 9 及以上。覆盖升级前先导出完整备份，安装与迁移见 [安卓说明](docs/ANDROID.md)。

本源码仓库 `fly-01-hub/Mind-map` 已公开，可直接克隆到服务器构建和开发。个人导图、论文、数据库、备份、凭据、签名材料和本机配置仍不得提交。下载仓库 `Mind-map-download` 独立维护：main 分支放使用说明与虚构示例的演示素材，Release 放 EXE/APK，gh-pages 分支放网页构建资源；不要将源码分支或历史镜像推送到下载仓库。下载仓库的 “Source code” ZIP/TAR 只对应它自己的分支内容；开发工程请从本仓库获取。

安装前关闭旧版并创建完整备份。未提供可信商业签名，系统可能拦截安装；不要关闭或绕过安全保护。新安装为空白，正常覆盖升级保留原用户数据。其他人不会得到开发者的本地知识库。

源码运行需要 Node.js 24：

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

打开终端显示的本地地址。生产网页：

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

PWA 可在支持的浏览器中安装为独立窗口，但本地网页仍需本机服务运行；它不是 Windows 安装包。浏览器来源、PWA、Windows 和安卓各自拥有数据空间，不会自动搬运旧资料。

## 局域网共享程序

支持“大家使用同一套软件，各自保存资料”的独立 HTTPS 部署模式。只共享编译后的程序文件，导图、历史、PDF、批注及备份仍保存在各自浏览器中；不新增共享数据库，不改变现有前端功能。原 `127.0.0.1:4173` 使用方式和资料保持不变。

部署者配置本机 `config/lan.local.json`、客户端信任的 HTTPS 证书及经批准的网络访问后，运行 `npm run lan:check`、`npm run lan:serve`。没有证书时可以用 `npm run lan:cert-request` 生成管理员签名所需的申请。不会自动安装根证书、修改防火墙或绕过安全警告。完整步骤及隔离边界见 [局域网部署教程](docs/LAN.md)。

## 主要功能

- 导图与文档大纲共享节点树；结构编辑、排序、拖动、搜索、收藏、文件夹和回收站。
- 网页多窗口：知识库每份导图旁的“新窗口打开”按钮，或编辑页顶部“多窗口”，可同时打开多份导图并分别编辑、保存。各窗口使用同一浏览器资料空间，无需复制导图；同一份导图自动协调编辑权限。完整知识库替换前需先关闭其他窗口，部分导入仍可使用。
- 富文本、局部文字颜色、描述、标签、待办、图片和附件；撤销、重做及历史版本。
- `[[文档名称]]` 双向链接、反向引用与定位。
- PDF 本地导入、阅读、批注和论文节点关联。
- 完整 `.researchmind` 备份与恢复；Markdown/OPML 等格式导入导出。
- 大容量完整／部分备份把论文和附件逐文件保存并校验，避免整个二进制资料库转成单个 Base64 字符串；继续读取旧版 JSON 备份。新大容量包需使用 1.7.14 或更高版本恢复。
- 勾选一份或多份完整导图，备份为 `.rmpart`，携带相关历史、附件、PDF、批注和阅读进度；从部分或完整备份中选择导图新增导入，保留现有资料。
- 导入 `.rmstudy` 文献资料包，新增独立导图并关联 PDF。三项入口都在“备份与恢复”中，见 [部分导图备份](docs/PARTIAL_BACKUP.md) 与 [文献资料包格式](docs/STUDY_PACKAGES.md)。
- 编辑时画布尽量保持位置，只在内容越界时最小平移；“＋”跟随编辑框。

操作细节：[快捷键](docs/SHORTCUTS.md)、[节点按钮](docs/NODE_CONTROLS.md)、[文字颜色](docs/TEXT_COLORS.md)、[节点排序](docs/NODE_ORDER.md)、[画布稳定性](docs/VIEWPORT_STABILITY.md)、[双向链接](docs/DOCUMENT_LINKS.md)、[PDF 知识库](docs/PDF_KNOWLEDGE.md)、[安卓](docs/ANDROID.md)。

1.7.9 优化大型导图：常见编辑按变化更新，撤销记录共享未变分支，自动保存只写入变动文档。5,000 节点生产回归验证新增、撤销/重做和刷新后的内容；复杂结构编辑仍完整刷新，具体速度取决于设备与内容。详见 [性能说明](docs/PERFORMANCE.md)。

1.7.11 再次加强资料保护：修复节点切换遗漏的详情草稿、多行恢复换行、同版本冲突判断和批量附件部分失败；新完整备份增加 SHA-256 校验。保留关闭与更新前提交、保存失败重试、多窗口协调和恢复前安全副本。无法读取资料时停止写入，避免把读取失败当成空白覆盖。浏览器清理和设备故障仍需要独立完整备份；详见 [本地资料保护](docs/DATA_SAFETY.md)。

## 数据与隐私

数据存储在当前用户的本地 IndexedDB 中。Windows 使用固定 `app://researchmind` 来源及 ResearchMind 用户配置目录。源码、安装包和 GitHub 构建均不复制开发者的浏览器配置或桌面用户数据。

完整备份包含导图、文件夹、回收站、历史版本、附件、PDF、批注及关联关系。备份未加密，请独立妥善保存，**不要放进公开仓库**。从“备份与恢复”恢复会替换当前数据库，不是合并；恢复前先备份已有内容。程序初始化只设置元信息，不删除已有记录。

仓库忽略 `release/`、用户配置、数据库、PDF、`.researchmind` 备份、签名密钥及环境变量。Windows 打包仅允许生产网页资源、Electron 壳和 package.json；测试夹具只在隔离测试环境加载，不进入生产资源。

## 构建与验证

```powershell
npm run typecheck
npm test
npm run lint
npm run test:e2e
npm run test:public
npm run verify:public
npm run test:lan
npm run test:lan:browser
npm run desktop:build
# 桌面专项使用独立临时配置，不读写日常知识库
npm run desktop:test
```

Windows 安装包构建目标为 `release/ResearchMind-Setup-<版本>-x64.exe`。本机在构建1.7.12时，NSIS临时卸载器执行被Windows应用控制阻止，没有生成可发行安装包。1.7.13使用`desktop:unpacked`构建，在确认Electron外壳、依赖及解包运行文件一致后，备份资料并更新原安装中的应用资源，已验证本机客户端。没有关闭安全设置，也没有生成或发布1.7.13安装包。后续安装包应在允许执行所需构建步骤的环境中完成，不得发布失败的临时产物。

本源码仓库的版本标签触发 GitHub Actions 构建与 Release 发布。另行执行 `npm run release:public` 可完成检查、安装包构建、网页构建及下载仓库发行；凭据从当前 GitHub 登录读取，不写入文件。向下载仓库上传的内容仍限制为 EXE/APK、使用说明及网页构建资源，不镜像推送源码分支、标签或历史。安卓需 JDK 17 与 Android SDK，见 [安卓构建说明](docs/ANDROID.md)。

安装包不包含个人知识库，但包含运行所需的程序资源。源码公开也不会公开各用户保存在设备中的资料。

桌面启动/构建命令会先执行 Electron 提供的运行时安装脚本；首次下载需联网。`npm ci` 只安装 Electron 的 npm 包，不保证桌面运行时已下载。

测试通过不代表所有设备和历史数据零缺陷；安卓浏览器模拟测试不替代真机验收。其他设计与限制见 [架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[已知限制](docs/KNOWN_ISSUES.md)。维护者请先阅读 [redme.txt](redme.txt)。
