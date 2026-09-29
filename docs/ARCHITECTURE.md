# 架构

## 数据流

```text
React Features
  → 拆分的 Zustand Stores
  → 领域 NodeData 与纯树操作
  → Dexie / IndexedDB（350ms 防抖，自动保存）
  → .researchmind 完整备份（用户主动创建）

Outline Editor ─┐
                ├→ NodeData（唯一数据源）
Map View ───────┘→ MindMapEngineAdapter → Mind Elixir 6（待逐步替换）
```

`NodeData` 是 Source of Truth。大纲直接执行领域树命令；Mind Elixir `NodeObj` 只由适配器转换产生，引擎操作再转换回 NodeData。两种视图不能保存各自独立的节点副本。数据库访问集中在 repository/service。

## 状态边界

- `documentStore`：文档、文件夹、领域命令、剪贴板、undo/redo
- `selectionStore`：当前节点，不持久化
- `uiStore`：Inspector、搜索和 Focus Mode
- `saveStore`：正在保存、已保存到本地、失败状态
- `userStore`：固定的本地身份，用于兼容历史数据字段
- `paperStore`：论文元数据、节点关联与批注索引

hover、缩放和平移不进入数据库。富文本 Inspector 按需加载，主路由也按页拆包。

## 本地存储与完整备份

Dexie 数据库 schema version 为 3。除文档数据外，还包含 papers、paperFiles、paperReadingStates、paperAnnotations、nodePaperRelations 和 annotationNodeRelations。论文数据独立于文档 JSON，避免同一 PDF 在多个节点中重复保存。

日常修改先进入 Zustand，再由 350ms 防抖持久化到 IndexedDB。普通附件和 PDF Blob 同样保存在 IndexedDB；PDF 内容使用 SHA-256 去重，节点只保存关系记录。

完整备份服务在只读事务中读取全部 11 张表，把附件与 PDF Blob 编码进版本化 JSON，生成 `.researchmind` 文件。恢复先在内存中解析和校验文件，再在单个读写事务中清空并写回全部表；写入失败时 Dexie 会回滚整个事务。浏览器支持文件选择器时，用户可以直接把文件保存到百度网盘桌面客户端的同步目录。

旧版本留下的云账号 ID 只作为兼容字段保留，不再控制本地资料可见性；相同哈希的论文会跨旧 ID 复用。

## 引擎与导出

使用 `mind-elixir@6.0.0-next.4` 的公开 API。完整 PNG 由官方 `@mind-elixir/export-mindmap` 插件生成，白底、2×、无水印；Markdown 使用应用自己的可逆格式，以 HTML 注释保存富字段。

## PDF 阅读器

`/paper/:paperId` 路由按需加载 `pdfjs-dist`、PDF Worker 与阅读器界面，不进入主编辑器首屏包。阅读器一次只通过 `getPage()` 渲染当前页，高 DPI Canvas 负责页面图像，PDF.js TextLayer 负责文字选择和搜索命中显示。

全文搜索按需提取各页文本并在当前会话缓存，不提前渲染全部页面。页码与缩放比例防抖写入 `paperReadingStates`；PDF 始终从本地 `paperFiles` 读取。

文字选择从 PDF.js TextLayer 获取浏览器 Range，把每行选区转换为页面宽高的 0–1 归一化矩形。`AnnotationLayer` 独立覆盖在 Canvas 与 TextLayer 之间；标注增删只更新覆盖层和 `paperAnnotations`，不会触发 PDF Canvas 或思维导图重写。

选区或已有批注可通过 `paperKnowledgeService` 生成思维导图节点。该服务在一个 Dexie 事务中更新文档树、批注、`NodePaperRelation` 与 `AnnotationNodeRelation`，保证节点正文、论文关联和精确引用不会部分写入，随后同步 Zustand 状态与撤销历史。

Markdown 导出会按 `AnnotationNodeRelation` 回查批注和论文，为生成节点附带论文标题、页码、原文引用和个人笔记；没有论文来源的普通节点保持原有导出格式。

双向定位使用可复制的路由参数完成，不依赖临时内存状态：节点来源链接携带 `page` 与 `annotationId` 打开阅读器，阅读器恢复指定页面、将目标标注滚动到视区中心并短暂描边；批注反向链接携带 `nodeId` 返回思维导图，编辑器自动展开祖先路径、选中目标节点并打开详情栏。

## AI 边界

`services/ai/AIProvider.ts` 当前只保留离线 Mock，不联网、不要求账号，也不读取本地资料以外的内容。真实网络 Provider 不属于本地核心版本；除非用户未来明确启用独立扩展，否则不会加入登录、API Key 或后台服务。
