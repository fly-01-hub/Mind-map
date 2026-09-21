# 架构

## 数据流

```text
React Features
  → 拆分的 Zustand Stores
  → 领域 NodeData 与纯树操作
  → Dexie / IndexedDB（350ms 防抖，先落本地）
  → Supabase Sync（1100ms 防抖，可选）

Map Editor → MindMapEngineAdapter → Mind Elixir 6
```

`NodeData` 是 Source of Truth。Mind Elixir `NodeObj` 只由适配器转换产生；引擎操作再转换回 NodeData。UI 组件不直接散落 Supabase 查询，数据库访问集中在 repository/service。

## 状态边界

- `documentStore`：文档、文件夹、领域命令、剪贴板、undo/redo
- `selectionStore`：当前节点，不持久化
- `uiStore`：Inspector、搜索和 Focus Mode
- `saveStore`：正在保存、本地、同步、离线、失败状态
- `userStore`：本地模式或 Supabase 用户
- `paperStore`：论文元数据、节点关联、批注索引与上传状态

hover、缩放和平移不进入数据库，也不会触发云同步。富文本 Inspector 按需加载，主路由也按页拆包。

## 本地与云端

Dexie 数据库当前 schema version 为 3。除原有文档数据外，还包含 papers、paperFiles、paperReadingStates、paperAnnotations、nodePaperRelations 和 annotationNodeRelations。论文数据独立于文档 JSON，避免同一 PDF 在多个节点中重复保存。

配置 Supabase 后，登录会先拉取云端文档和文件夹，再合并本地数据。保存按约 1100ms 防抖上传。远端版本更高或同版本内容分叉时，系统先创建“冲突恢复”本地副本，再采用云端版本；离线内容始终保留并在 online 事件后重试。

内置示例文档使用可读 ID，仅保留在本地；用户创建的 UUID 文档和文件夹才会同步云端。

PDF 上传后先写本地缓存，再在登录且联网时上传私有 `papers` Storage。内容 SHA-256 用于去重；节点仅保存关系记录。普通图片和其他文件仍沿用 attachmentRepository。

## 引擎与导出

使用 `mind-elixir@6.0.0-next.4` 的公开 API。完整 PNG 由官方 `@mind-elixir/export-mindmap` 插件生成，白底、2×、无水印；Markdown 使用应用自己的可逆格式，以 HTML 注释保存富字段。

## PDF 阅读器

`/paper/:paperId` 路由按需加载 `pdfjs-dist`、PDF Worker 与阅读器界面，不进入主编辑器首屏包。阅读器一次只通过 `getPage()` 渲染当前页，高 DPI Canvas 负责页面图像，PDF.js TextLayer 负责文字选择和搜索命中显示。

全文搜索按需提取各页文本并在当前会话缓存，不提前渲染全部页面。页码与缩放比例防抖写入 `paperReadingStates`；云端 PDF 首次打开后写入 `paperFiles`，后续可离线读取。

文字选择从 PDF.js TextLayer 获取浏览器 Range，把每行选区转换为页面宽高的 0–1 归一化矩形。`AnnotationLayer` 独立覆盖在 Canvas 与 TextLayer 之间；标注增删只更新覆盖层和 `paperAnnotations`，不会触发 PDF Canvas 或思维导图重写。

选区或已有批注可通过 `paperKnowledgeService` 生成思维导图节点。该服务在一个 Dexie 事务中更新文档树、批注、`NodePaperRelation` 与 `AnnotationNodeRelation`，保证节点正文、论文关联和精确引用不会部分写入。随后同步 Zustand 状态、撤销历史与可选云端队列。

Markdown 导出会按 `AnnotationNodeRelation` 回查批注和论文，为生成节点附带论文标题、页码、原文引用和个人笔记；没有论文来源的普通节点保持原有导出格式。

双向定位使用可复制的路由参数完成，不依赖临时内存状态：节点来源链接携带 `page` 与 `annotationId` 打开阅读器，阅读器恢复指定页面、将目标标注滚动到视区中心并短暂描边；批注反向链接携带 `nodeId` 返回思维导图，编辑器自动展开祖先路径、选中目标节点并打开详情栏。Mind Elixir 的画布定位只通过适配层公开的 `scrollIntoView` API 完成。

阅读器的论文笔记栏属于临时 UI 状态，可随时收起以扩大 PDF 画布；窄屏下改为右侧抽屉而不是直接移除功能。批注列表支持“全部/本页”视图，当前定位标注与仅位于当前页的标注采用不同视觉层级。页码进度条不进入数据库，阅读页码和缩放仍由 `paperReadingStates` 持久化。

## AI 边界

`services/ai/AIProvider.ts` 定义生成脑图、总结、扩写、改写、论文分析、论文比较和子树整理。当前 Mock Provider 不联网。未来真实 Provider 必须通过服务端代理，API Key 不得进入浏览器包。
