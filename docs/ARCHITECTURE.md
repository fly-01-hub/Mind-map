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
Map View ───────┘→ MindMapEngineAdapter → Mind Elixir 6（隔离在适配层）
```

`NodeData` 是 Source of Truth。大纲直接执行领域树命令；Mind Elixir `NodeObj` 只由适配器转换产生，引擎操作再转换回 NodeData。两种视图不能保存各自独立的节点副本。数据库访问集中在 repository/service。

## 状态边界

- `documentStore`：文档、文件夹、领域命令、剪贴板、undo/redo
- `selectionStore`：当前节点，不持久化
- `uiStore`：Inspector、搜索和 Focus Mode
- `saveStore`：正在保存、已保存到本地、失败状态
- `userStore`：固定的本地身份，用于兼容历史数据字段
- `paperStore`：论文元数据、节点关联与批注索引

导图 hover、临时选择、缩放和平移不进入数据库；PDF 阅读页码和缩放会持久化。界面偏好另存 localStorage，不包含在完整数据库备份中。富文本 Inspector 按需加载，主路由也按页拆包。

## 本地存储与完整备份

Dexie 数据库 schema version 为 3。除文档数据外，还包含 papers、paperFiles、paperReadingStates、paperAnnotations、nodePaperRelations 和 annotationNodeRelations。论文数据独立于文档 JSON，避免同一 PDF 在多个节点中重复保存。

文档日常修改先进入 Zustand，再由 350ms 防抖持久化到 IndexedDB；文件夹变化立即触发保存。普通附件和 PDF Blob 同样保存在 IndexedDB；PDF 内容使用 SHA-256 去重，节点只保存关系记录。内存撤销历史与持久化版本快照分别维护，后者每文档保留最近 50 条。

完整备份服务在只读事务中读取全部 11 张表，把附件与 PDF Blob 编码进版本化 JSON，生成 `.researchmind` 文件。恢复先在内存中解析和校验文件，再在单个读写事务中清空并写回全部表；写入失败时 Dexie 会回滚整个事务。浏览器支持文件选择器时，用户可以直接把文件保存到百度网盘桌面客户端的同步目录。

旧版本留下的云账号 ID 只作为兼容字段保留，不再控制本地资料可见性；相同哈希的论文会跨旧 ID 复用。

## 引擎与导出

Mind Elixir 使用适配器内的公开 API（声明范围及实际解析版本以 package.json/package-lock.json 为准）。完整 PNG 由官方 `@mind-elixir/export-mindmap` 插件生成，白底、2×、无水印；Markdown 以 HTML 注释保存部分富字段，但不包含完整二进制资料或引用关系，不能替代 `.researchmind` 备份。

## PDF 阅读器

`/paper/:paperId` 路由按需加载 `pdfjs-dist`、PDF Worker 与阅读器界面，不进入主编辑器首屏包。阅读器一次只通过 `getPage()` 渲染当前页，高 DPI Canvas 负责页面图像，PDF.js TextLayer 负责文字选择和搜索命中显示。

全文搜索按需提取各页文本并在当前会话缓存，不提前渲染全部页面。页码与缩放比例防抖写入 `paperReadingStates`；PDF 始终从本地 `paperFiles` 读取。

文字选择从 PDF.js TextLayer 获取浏览器 Range，把每行选区转换为页面宽高的 0–1 归一化矩形。`AnnotationLayer` 独立覆盖在 Canvas 与 TextLayer 之间；标注增删只更新覆盖层和 `paperAnnotations`，不会触发 PDF Canvas 或思维导图重写。

选区或已有批注可通过 `paperKnowledgeService` 生成思维导图节点。该服务在一个 Dexie 事务中更新文档树、批注、`NodePaperRelation` 与 `AnnotationNodeRelation`，保证节点正文、论文关联和精确引用不会部分写入，随后同步 Zustand 状态与撤销历史。

Markdown 导出会按 `AnnotationNodeRelation` 回查批注和论文，为生成节点附带论文标题、页码、原文引用和个人笔记；没有论文来源的普通节点保持原有导出格式。

双向定位使用路由参数或内嵌阅读器的定位参数：节点来源携带页码/批注 ID，阅读器将目标滚动到视区；文字标注不额外绘制整框定位描边。区域高亮采用透明整块填充，普通图表区域保留描边。批注反向链接携带 `nodeId`，编辑器展开祖先路径并定位目标。

## 内嵌阅读与区域样式

PDF 阅读器同时支持独立路由与导图内嵌模式；通过 lazy/Suspense 按需加载 PDF.js。内嵌模式的快捷键仅作用于阅读区，不抢占导图的方向键和搜索。来源徽标是引擎适配层的展示元素，不写入主题正文。全局 `/annotations` 页面使用同一批注和关系数据；批量关联以一次事务写入，重复关联复用旧关系 ID。

直接拖入 PDF 建立文献子节点并打开左 PDF / 右导图；内嵌模式的新批注自动建立在固定文献父节点下。独立阅读页仍手动选目标。`areaStyle` 是区域批注可选字段：`highlight` 整块填充，`outline` 描边，缺失时兼容历史描边。旧文字标注根据摘录与原位置重锚定显示，不覆盖旧存储矩形；不能可靠匹配时回退。

## 文档链接

`utils/wikiLinks.ts` 解析节点标题与笔记中的 `[[文档名称]]`；导图展示用 span，实时 contenteditable 用 CSS Highlights 绘制范围，以保留原生文字选区、输入法和编辑撤销。标记不写入节点的富文本内容。两种编辑视图共用文档打开/新建流程；导航前提交编辑并 flush 本地保存。

反向引用从当前节点树派生，不另建需同步的关系表；引用来源按文档和节点定位。`documentStore` 统一处理名称冲突、重命名后的引用更新和旧名 `linkAliases`；仓库批量写入采用事务，自动保存队列串行化，防止较旧保存覆盖较新编辑。可选字段保留数据库 v3 和备份 v1 兼容性。

## AI 边界（扩展接口）

`services/ai/AIProvider.ts` 当前只保留离线 Mock，不联网、不要求账号，也不读取本地资料以外的内容。真实网络 Provider 不属于本地核心版本；除非用户未来明确启用独立扩展，否则不会加入登录、API Key 或后台服务。
