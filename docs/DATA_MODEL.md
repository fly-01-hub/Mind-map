# 数据模型

## NodeData

节点包含 `id`、纯文本 `title`、可选 HTML `richText`、`children`、`collapsed`、`order`、创建/更新时间、`style`、`tags`、`taskStatus`、`hyperlink`、Markdown `note`、`code`、`formula`、`icon`、`image`、`table` 和 `attachments`。任务状态为 `none | todo | doing | done`。每节点只有一张主图，图片 data URL 随节点保存；普通附件 Blob 独立存储。

NodeData 是唯一业务数据源；Mind Elixir 内部结构不写入 Store 或数据库。

## Document 与 Folder

文档包含 `id`、`title`、`root`、`folderId`、`isFavorite`、递增 `version`、时间戳与软删除 `deletedAt`，另含 `arrows`、`summaries`、`mapTheme` 和 `compactMap`。文件夹以 `parentId` 支持嵌套；删除文件夹会软删除其后代文件夹，并把其中的文档送入回收站。

## 文档双向链接（1.6.0）

`[[名称]]` 保留在 `NodeData.title`、对应 `richText` 或 Markdown `note` 原文中；高亮标记只用于显示。反向引用从当前树内容计算，按来源文档/节点去重，并过滤回收站文档。无需新增关系表或迁移数据库。

文档新增可选 `linkAliases: string[]`，保存重命名前的名称，供历史内容及旧导入解析；完整备份 v1 原样保留并校验该字段。匹配忽略名称首尾空格和大小写，进行 Unicode NFC 规范化。新建名称唯一，旧同名文档由用户选择目标；恢复重名文档添加数字后缀。跨文档重命名的写入以一个事务保存，保存请求串行执行。详情见 [双向链接](DOCUMENT_LINKS.md)。

## Attachment（附件记录）

附件引用包含 `id`、文件名、MIME、大小、本地路径标识、创建/软删除时间，并预留 `pageNumber`、`quote`、`note`。Blob 写入本地 `attachmentBlobs`，并随完整备份一起导出。

普通附件不承载论文关系。PDF 新上传会进入独立的 Paper 领域。

## Paper 与节点关系

`Paper` 保存论文元数据、SHA-256 和页数，PDF Blob 保存在独立的 `paperFiles`。`NodePaperRelation` 使用 `documentId + nodeId + paperId` 唯一约束表达节点与论文的多对多关系；解除关联只软删除关系，不删除论文。

`PaperReadingState` 以论文 ID 为主键保存最近页码、缩放比例、`scrollOffset` 和更新时间；当前阅读器主要恢复页码/缩放，不能据类型字段宣称已恢复精确页内滚动。阅读器发现实际页数后会回写 Paper 元数据。相同内容哈希的 PDF 会复用已有 Paper。

`PaperAnnotation` 保存类型、页码、文字、笔记及归一化位置。`AnnotationNodeRelation` 使用 `annotationId + documentId + nodeId` 唯一约束表达批注与节点的多对多实时引用；关联已有节点或生成子节点时同时创建 `NodePaperRelation`。节点笔记与批注笔记分别维护，不互相覆盖。

双向跳转不复制来源字段：节点到 PDF 时由 `AnnotationNodeRelation → PaperAnnotation → Paper` 解析目标，PDF 到节点时由同一关系解析 `documentId + nodeId`。路由仅携带定位 ID，来源正文以本地数据库为准。

标注位置格式为 `{ version, pageWidth, pageHeight, rotation, rects[] }`。每个矩形的 `x/y/width/height` 均相对页面归一化，因此缩放和高 DPI 渲染不会改变标注位置。标注类型为 `highlight | underline | note | area`。可选字段为 `color`（默认 yellow）、`tags`（默认空）、`previewImage`（区域 PNG 预览）、`areaStyle`（`highlight` 整块透明填充 / `outline` 描边，历史缺失字段默认描边）。这些字段无需新增索引或迁移，旧 v3 数据库和 v1 备份可直接读取。

解除引用只软删除关系；删除批注只软删除批注，保留关系与节点，方便撤销恢复。删除/撤销节点时关系留存，展示层只解析仍存在的节点，恢复节点后来源重新出现。重新框选区域更新同一个批注 ID，不清空笔记、标签或关联。引用文本格式为 `researchmind://annotation/<id>`，只在本地粘贴处理器中解析，不启动外部服务。

## Version

版本快照包含文档 ID、文档 version、标题、完整 root、arrows、summaries、创建时间与原因。类型支持 interval、important、before-restore 和 conflict；每份文档只保留最近 50 条。保存触发的 interval 快照约 120 秒间隔，不是每按键一个版本；内存 undo/redo 栈不跨重启，也不在备份中。

## 完整备份

备份格式带有固定标识 `researchmind-local-backup` 和版本号。`documents`、`folders`、`versions`、`attachmentBlobs`、`papers`、`paperFiles`、`paperReadingStates`、`paperAnnotations`、`nodePaperRelations`、`annotationNodeRelations` 与 `meta` 会整体导出；Blob 使用 MIME 类型和 Base64 内容表示。

数据库名为 `zhijian-knowledge-db`，schema version 为 3，备份格式 version 为 1。恢复是校验后的全部表原子替换，不是合并。localStorage 界面偏好和临时状态不在备份内；备份未加密，Base64 不提供保密性。
