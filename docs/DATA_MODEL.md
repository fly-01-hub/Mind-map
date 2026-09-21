# 数据模型

## NodeData

节点包含 `id`、`title`、`children`、`collapsed`、`order`、创建/更新时间、`style`、`tags`、`taskStatus`、`hyperlink`、Markdown `note`、`code`、`formula`、`icon`、`image` 和 `attachments`。任务状态为 `none | todo | doing | done`。

NodeData 是唯一业务数据源；Mind Elixir 内部结构不写入 Store 或数据库。

## Document 与 Folder

文档包含 `id`、`title`、`root`、`folderId`、`isFavorite`、递增 `version`、时间戳与软删除 `deletedAt`。文件夹包含 `parentId`，因此可以无限嵌套；删除文件夹会软删除其后代文件夹，并把其中的文档送入回收站。

## Attachment

附件引用包含 `id`、文件名、MIME、大小、Storage 路径、创建/软删除时间，并预留 `pageNumber`、`quote`、`note`。Blob 先写本地 `attachmentBlobs`；登录且联网时上传私有 Storage，路径为 `user_id/document_id/attachment_id/file_name`。

普通附件不承载论文关系。PDF 新上传会进入独立的 Paper 领域。

## Paper 与节点关系

`Paper` 保存论文元数据、SHA-256、页数和 Storage 路径，PDF Blob 保存在独立的 `paperFiles` 本地缓存。`NodePaperRelation` 使用 `documentId + nodeId + paperId` 唯一约束表达节点与论文的多对多关系；解除关联只软删除关系，不删除论文。

`PaperReadingState` 以论文 ID 为主键保存最近页码、缩放比例、滚动位置和更新时间。阅读器发现实际页数后会回写 Paper 元数据。

相同用户上传内容哈希一致的 PDF 时复用已有 Paper。云端 PDF 位于私有 `papers` Bucket，路径为 `user_id/paper_id/file_name`。

`PaperAnnotation` 保存类型、页码、文字、笔记及归一化位置。`AnnotationNodeRelation` 使用 `annotationId + documentId + nodeId` 唯一约束记录批注生成到哪个节点；生成节点时同时创建 `NodePaperRelation`，因此既能从节点打开整篇论文，也能精确追溯到页码和原文选区。

双向跳转不复制来源字段：节点到 PDF 时由 `AnnotationNodeRelation → PaperAnnotation → Paper` 解析目标，PDF 到节点时由同一关系解析 `documentId + nodeId`。路由仅携带定位 ID，来源正文仍以本地数据库与 Supabase 数据为准。

标注位置格式为 `{ version, pageWidth, pageHeight, rotation, rects[] }`。每个矩形的 `x/y/width/height` 均相对页面归一化，因此缩放和高 DPI 渲染不会改变标注位置。标注类型为 `highlight | underline | note`，删除使用 `deletedAt` 软删除并同步云端。

## Version

版本快照包含文档 ID、文档 version、标题、完整 root、创建时间与原因。原因包括 interval、important、before-restore 和 conflict；每份文档只保留最近 50 条。

Supabase 对应表为 profiles、folders、documents、document_versions、attachments、papers、paper_annotations、node_paper_relations 和 annotation_node_relations。所有用户表均启用 RLS，浏览器只使用 Anon/Publishable Key。
