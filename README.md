# ResearchMind 枝间

本地优先的思维导图、文档大纲与 PDF 阅读工具。当前源码版本 **1.7.7**。

[免费在线使用](https://fly-01-hub.github.io/Mind-map-download/) · [下载 Windows 安装包](https://github.com/fly-01-hub/Mind-map-download/releases/latest)。源码保持私有，公开网页只分发构建后的运行资源，各自的资料保存在本机或浏览器中。发布维护见 [免费分发说明](docs/DISTRIBUTION.md)。

新对话中的 AI 接手请先完整阅读 [redme.txt](redme.txt)。其中汇总项目结构、数据安全、未提交改动、部署与证书状态、验证记录及待办事项；状态快照整理于 2026-10-12，接手时应重新核对。

**首次打开是空白知识库**：不预置导图、文件夹、论文、附件或历史记录。已有用户升级不会被清空；只有主动新建或导入备份才会出现内容。无需账号、云数据库或付费 API。

## 下载与运行

Windows 安装包及面向用户的完整教程见 [公开下载仓库 Mind-map-download](https://github.com/fly-01-hub/Mind-map-download)，或直接打开 [公开 GitHub Releases](https://github.com/fly-01-hub/Mind-map-download/releases/latest)，选择 `ResearchMind-Setup-1.7.7-x64.exe`。

本源码仓库 `fly-01-hub/Mind-map` **必须保持私有**，不要通过删除当前分支的源码后将其公开：Git 历史和构建记录仍可能泄露源码。公开下载仓库独立维护：main 分支放使用说明，Release 放 EXE 附件，gh-pages 分支只放网页构建资源，不共享本仓库的源码或提交历史。Release 的自动 “Source code” ZIP/TAR 对应公开 main 分支的说明；gh-pages 的 ZIP 包含可查看的网页运行资源，均不是原始开发工程。

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
- 富文本、局部文字颜色、描述、标签、待办、图片和附件；撤销、重做及历史版本。
- `[[文档名称]]` 双向链接、反向引用与定位。
- PDF 本地导入、阅读、批注和论文节点关联。
- 完整 `.researchmind` 备份与恢复；Markdown/OPML 等格式导入导出。
- 编辑时画布尽量保持位置，只在内容越界时最小平移；“＋”跟随编辑框。

操作细节：[快捷键](docs/SHORTCUTS.md)、[节点按钮](docs/NODE_CONTROLS.md)、[文字颜色](docs/TEXT_COLORS.md)、[节点排序](docs/NODE_ORDER.md)、[画布稳定性](docs/VIEWPORT_STABILITY.md)、[双向链接](docs/DOCUMENT_LINKS.md)、[PDF 知识库](docs/PDF_KNOWLEDGE.md)、[安卓](docs/ANDROID.md)。

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

Windows 输出 `release/ResearchMind-Setup-1.7.7-x64.exe`。本私有仓库的版本标签触发 GitHub Actions 构建与私有 Release 发布。执行 `npm run release:public` 可完成检查、安装包构建、网页构建及公开发行；凭据从当前 GitHub 登录读取，不写入文件。公开上传严格限制为 EXE、使用说明及网页构建资源。不得将本仓库的分支、标签、源码、构建日志或 Git 历史推到公开下载仓库；不要使用镜像推送。安卓需 JDK 17 与 Android SDK，见 [安卓构建说明](docs/ANDROID.md)。

安装包不包含个人知识库，但包含运行所需的程序资源。不公开源码仓库不等于程序不可逆向；不要承诺 EXE 无法被提取或绝对源码保密。

桌面启动/构建命令会先执行 Electron 提供的运行时安装脚本；首次下载需联网。`npm ci` 只安装 Electron 的 npm 包，不保证桌面运行时已下载。

测试通过不代表所有设备和历史数据零缺陷；安卓浏览器模拟测试不替代真机验收。其他设计与限制见 [架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[已知限制](docs/KNOWN_ISSUES.md)。维护者请先阅读 [redme.txt](redme.txt)。
