# 枝间 · 个人知识思维导图

枝间是一款完全 Local-first 的个人 Web 思维导图，适合整理论文、科研项目、知识体系和创作设定。所有资料都写入当前浏览器的 IndexedDB，不需要注册、登录或配置云数据库。

## 已实现的能力

- 单侧右向脑图、键盘编辑、拖拽换父级、折叠、右键菜单、Focus Mode、撤销/重做
- Node Inspector：Markdown/LaTeX/代码、待办、标签、链接、颜色、图标、PDF/图片/普通附件
- IndexedDB 自动保存、刷新恢复和每份文档最近 50 个历史版本
- 全文搜索、收藏、嵌套文件夹、拖拽归档、回收站
- Markdown 导入/导出，以及官方 Mind Elixir 导出插件生成完整 2× PNG
- PDF 可从资源管理器直接拖到导图节点，自动生成论文子节点；内置 PDF.js 分页阅读、全文搜索、缩放、阅读进度恢复与离线保存
- PDF 高亮、下划线和批注；标注可生成思维导图节点并在节点与原文之间双向定位
- 论文与节点多对多关联、SHA-256 去重，以及保留论文标题、页码、引用和笔记的 Markdown 导出
- `.researchmind` 完整备份与原子恢复，覆盖导图、历史、附件、PDF、批注及阅读进度
- 预留 AIProvider 接口，当前 Mock Provider 不发送任何网络请求

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

## 3. 备份到百度网盘

1. 在知识库右上角点击“备份与恢复”。
2. 点击“创建完整备份”。
3. 如果已经安装百度网盘桌面客户端，可把 `.researchmind` 文件直接保存到其本地同步目录；否则先保存到电脑，再手动上传到百度网盘。
4. 建议在重要编辑后或每周创建一次新备份，并保留最近几份。

恢复时点击“从备份恢复”并选择 `.researchmind` 文件。恢复会在校验成功后整体替换当前浏览器内的数据；任何步骤失败都会回滚，不会留下半套数据。

> 浏览器站点数据仍是日常工作的主存储。清理浏览器数据、重装系统或更换设备前，务必先创建完整备份。

## 4. 检查项目

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

## 5. 部署到 Vercel

1. 把仓库推送到 Git 平台。
2. 在 Vercel 新建项目并导入仓库，Framework Preset 选择 Vite。
3. Build Command 使用 `npm run build`，Output Directory 使用 `dist`。
4. 不需要配置环境变量。仓库中的 `vercel.json` 已包含 SPA 路由回退。

部署后数据仍只保存在访问该站点的浏览器中，不会自动上传到 Vercel。

## 目录

- `src/adapters/mindmap/`：Mind Elixir 的唯一适配边界
- `src/features/`：知识库、编辑器、备份恢复、Node Inspector 和论文阅读器
- `src/stores/`：文档、选中、UI、保存与本地用户状态
- `src/db/`、`src/repositories/`：Dexie 数据库、迁移和数据访问
- `src/services/`：本地持久化、完整备份、PDF 解析、来源导出和 AI 扩展接口
- `e2e/`：真实浏览器关键流程
- `docs/`：产品、架构、数据模型、快捷键和限制

进一步阅读：[产品说明](docs/PRODUCT.md)、[产品体验评审](docs/PRODUCT_REVIEW.md)、[架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[快捷键](docs/SHORTCUTS.md)、[已知限制](docs/KNOWN_ISSUES.md)。
