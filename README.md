# 枝间 · 个人知识思维导图

枝间是一款完全 Local-first 的个人大纲笔记与思维导图，核心体验采用“大纲快速输入、导图查看结构”的双视图模式。所有资料都写入当前浏览器或桌面应用自己的 IndexedDB，不需要固定网址、注册、登录或配置云数据库。

## 已实现的能力

- 大纲与思维导图共用同一棵节点树，默认进入大纲编辑
- 大纲支持 Enter 拆分/新建同级、Tab 缩进、Shift+Tab 提升、Shift+Enter 编辑描述、行首 Backspace 合并、方向键跨主题和拖动重排
- 选中文字可设置粗体、斜体、下划线、删除线、颜色、高亮、链接、代码和挖空；格式随本地文档一起保存
- Ctrl/Shift 点击圆点可多选主题，并批量复制、剪切、移动、完成、折叠或删除；可选层级编号
- 单侧右向脑图、双击局部编辑、Shift 点击/空白拖框多选、中键平移、拖拽换父级、上下文工具栏、折叠、右键菜单、Focus Mode、撤销/重做
- Node Inspector：Markdown/LaTeX/代码、待办、标签、链接、颜色、图标、PDF/图片/普通附件
- IndexedDB 自动保存、刷新恢复和每份文档最近 50 个历史版本
- 全文搜索、收藏、嵌套文件夹、拖拽归档、回收站
- 概要、跨主题关联线、四套导图配色、紧凑布局、只读浏览与演示模式
- Markdown、OPML、FreeMind、现代 XMind 导入；Markdown、OPML、FreeMind、XMind、HTML、PNG 与打印/PDF 导出
- Markdown 导入/导出，以及官方 Mind Elixir 导出插件生成完整 2× PNG
- PDF 可从资源管理器直接拖到导图节点，自动生成论文子节点；内置 PDF.js 分页阅读、全文搜索、缩放、阅读进度恢复与离线保存
- PDF 高亮、下划线和批注；标注可生成思维导图节点并在节点与原文之间双向定位
- 论文与节点多对多关联、SHA-256 去重，以及保留论文标题、页码、引用和笔记的 Markdown 导出
- `.researchmind` 完整备份与原子恢复，覆盖导图、历史、附件、PDF、批注及阅读进度
- 预留 AIProvider 接口，当前 Mock Provider 不发送任何网络请求
- PWA 离线应用壳、桌面安装入口，以及独立的 Windows `.exe` 安装包
- 知识库 `Ctrl+K` 搜索、`Ctrl+N` 新建，编辑器显式新增主题入口和可记忆宽度的详情栏

## 1. 安装 Node.js

安装 [Node.js](https://nodejs.org/) 24 或更新版本。安装完成后打开 PowerShell，输入：

```powershell
node --version
npm --version
```

## 2. 安装并运行

```powershell
cd D:\app\siweidaotu
npm install
npm run dev
```

终端会显示本地网址，通常是 `http://127.0.0.1:5173`。用 Chrome 或 Edge 打开即可直接进入知识库。

## 3. 安装到 Windows

### 使用 `.exe` 安装包

运行 `release/ResearchMind-Setup-1.2.0-x64.exe`，按向导选择安装目录。桌面版使用固定的 `app://researchmind` 本地来源，数据保存在 Windows 当前用户的 ResearchMind 应用数据目录中。

当前个人版本未购买商业代码签名证书。普通 SmartScreen 可能允许“更多信息”→“仍要运行”，但 Windows 11 的“智能应用控制”会直接拦截未签名程序且不提供绕过按钮。遇到后一种情况请保留安全功能，改用 Edge PWA；不要从非本仓库或非本人电脑生成的链接下载安装包。

网页和桌面版的数据空间彼此独立。首次切换时，请先在旧版本创建 `.researchmind` 备份，再到新版本执行“从备份恢复”。

重新生成安装包：

```powershell
npm run desktop:build
```

推送 `v*` 标签后，GitHub Actions 会自动构建安装包并添加到对应的 GitHub Release。

## 4. 创建本地备份

1. 在知识库右上角点击“备份与恢复”。
2. 点击“创建完整备份”。
3. 把 `.researchmind` 文件保存到安全的本地文件夹或移动硬盘；如果你自己使用同步盘，也可以选择它的本地同步目录。
4. 建议在重要编辑后或每周创建一次新备份，并保留最近几份。

恢复时点击“从备份恢复”并选择 `.researchmind` 文件。恢复会在校验成功后整体替换当前浏览器内的数据；任何步骤失败都会回滚，不会留下半套数据。

> 浏览器站点数据仍是日常工作的主存储。清理浏览器数据、重装系统或更换设备前，务必先创建完整备份。

## 5. 检查项目

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run lint
npm run build
```

E2E 默认调用本机 Chrome。若未安装 Chrome，可安装 Playwright Chromium，并在 `playwright.config.ts` 去掉 `channel: 'chrome'`：

```powershell
npx playwright install chromium
```

## 6. 本地运行原则

系统允许未签名程序时可使用 Windows `.exe`；若“智能应用控制”阻止启动，推荐通过 Edge 把 PWA 安装到电脑。两种方式都不要求应用账号；资料、附件和使用记录保存在对应应用或浏览器的本地数据库中。开发时可运行 `npm run dev`，它只在本机 `127.0.0.1` 提供页面。

## 目录

- `src/adapters/mindmap/`：Mind Elixir 的唯一适配边界
- `src/features/`：知识库、编辑器、备份恢复、Node Inspector 和论文阅读器
- `src/stores/`：文档、选中、UI、保存与本地用户状态
- `src/db/`、`src/repositories/`：Dexie 数据库、迁移和数据访问
- `src/services/`：本地持久化、完整备份、PDF 解析、来源导出和 AI 扩展接口
- `e2e/`：真实浏览器关键流程
- `docs/`：产品、架构、数据模型、快捷键和限制

进一步阅读：[产品说明](docs/PRODUCT.md)、[产品体验评审](docs/PRODUCT_REVIEW.md)、[架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[快捷键](docs/SHORTCUTS.md)、[已知限制](docs/KNOWN_ISSUES.md)。
