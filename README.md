# 枝间 · 个人知识思维导图

枝间是一款 Local-first 的个人 Web 思维导图，适合整理论文、科研项目、知识体系和创作设定。编辑会先写入浏览器 IndexedDB；配置 Supabase 后，再防抖同步到云端。未配置云服务时，全部核心功能仍可离线使用。

## 已实现的能力

- 单侧右向脑图、键盘编辑、拖拽换父级、折叠、右键菜单、Focus Mode、撤销/重做
- Node Inspector：Markdown/LaTeX/代码、待办、标签、链接、颜色、图标、PDF/图片/普通附件
- IndexedDB 自动保存、刷新恢复、50 份历史版本、冲突恢复副本
- 全文搜索、收藏、嵌套文件夹、拖拽归档、回收站
- Markdown 导入/导出，以及官方 Mind Elixir 导出插件生成完整 2× PNG
- PDF.js 论文阅读器：分页渲染、全文搜索、缩放、阅读进度恢复与离线缓存
- PDF 高亮、下划线和批注；标注可生成思维导图节点并在节点与原文之间双向定位
- 论文与节点多对多关联、SHA-256 去重，以及包含论文标题、页码、引用和笔记的 Markdown 来源导出
- Google OAuth、Supabase 数据同步、RLS 和私有 Storage；未配置时自动保持本地模式
- 预留 AIProvider 接口，当前 Mock Provider 不发送任何网络请求

## 1. 安装 Node.js

安装 [Node.js](https://nodejs.org/) 24 或更新版本。安装完成后打开 PowerShell，输入：

```powershell
node --version
npm --version
```

两条命令都能显示版本号即可。

## 2. 安装并运行

在 PowerShell 中进入项目目录：

```powershell
cd D:\app\siweidaotu
npm install
npm run dev
```

终端会显示本地网址，通常是 `http://127.0.0.1:5173`。用 Chrome 或 Edge 打开。点击“暂以本地模式进入”即可直接使用；数据只保存在这个浏览器配置中。

## 3. 配置 Supabase（可选，用于跨设备）

1. 在 [Supabase](https://supabase.com/) 创建项目。
2. 打开 Supabase 的 SQL Editor，新建查询，完整粘贴并运行 [supabase/schema.sql](supabase/schema.sql)。它会创建文档、附件、论文、批注及关系表，配置索引、RLS Policy，并创建私有 `attachments` 与 `papers` Bucket。
3. 在 Supabase 项目 Settings → API 中复制 Project URL 与 Anon/Publishable Key。不要使用 Service Role Key。
4. 把 `.env.example` 复制为 `.env.local`，填写：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的匿名或PublishableKey
```

5. 重新执行 `npm run dev`。环境变量只在启动时读取。

## 4. 配置 Google OAuth（可选）

1. 在 Google Cloud Console 创建 Web OAuth 客户端。
2. 按 Supabase Dashboard → Authentication → Providers → Google 页面给出的地址，配置 Google 的 Authorized redirect URI。
3. 将 Google Client ID 和 Client Secret 填入 Supabase 的 Google Provider 并启用。
4. 在 Supabase Authentication → URL Configuration 中，把本地地址 `http://127.0.0.1:5173/**` 和正式站点地址加入 Redirect URLs。
5. 回到登录页使用“使用 Google 登录”。登录后，本地修改先安全落盘，再约 1.1 秒防抖同步。

## 5. 检查项目

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run lint
npm run build
```

E2E 默认调用本机 Chrome。若未安装 Chrome，可先安装 Playwright Chromium，并在 `playwright.config.ts` 去掉 `channel: 'chrome'`：

```powershell
npx playwright install chromium
```

## 6. 部署到 Vercel

1. 把仓库推送到你自己的 Git 平台。
2. 在 Vercel 新建项目并导入仓库，Framework Preset 选择 Vite。
3. Build Command 使用 `npm run build`，Output Directory 使用 `dist`。
4. 在 Vercel Environment Variables 添加与 `.env.local` 同名的两项 Supabase 变量。
5. 仓库中的 `vercel.json` 已配置 SPA 回退；部署后将正式域名加入 Supabase 与 Google 的允许回调地址。
6. 不要提交 `.env.local`，也不要在前端配置 Service Role Key。

## 目录

- `src/adapters/mindmap/`：Mind Elixir 的唯一适配边界
- `src/features/`：登录、知识库、编辑器、Node Inspector 和论文阅读器
- `src/stores/`：文档、选中、UI、保存与用户状态
- `src/db/`、`src/repositories/`：Dexie 数据库、迁移和数据访问
- `src/services/`：云同步、认证、PDF 解析、来源导出和 AI 扩展接口
- `supabase/schema.sql`：完整数据库、RLS 与 Storage 配置
- `e2e/`：真实浏览器关键流程
- `docs/`：产品、架构、数据模型、快捷键和限制

进一步阅读：[产品说明](docs/PRODUCT.md)、[架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[快捷键](docs/SHORTCUTS.md)、[已知限制](docs/KNOWN_ISSUES.md)。
