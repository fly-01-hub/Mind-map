# 数据模型

## NodeData

节点包含 `id`、`title`、`children`、`collapsed`、`order`、创建/更新时间、`style`、`tags`、`taskStatus`、`hyperlink`、Markdown `note`、`code`、`formula`、`icon`、`image` 和 `attachments`。任务状态为 `none | todo | doing | done`。

NodeData 是唯一业务数据源；Mind Elixir 内部结构不写入 Store 或数据库。

## Document 与 Folder

文档包含 `id`、`title`、`root`、`folderId`、`isFavorite`、递增 `version`、时间戳与软删除 `deletedAt`。文件夹包含 `parentId`，因此可以无限嵌套；删除文件夹会软删除其后代文件夹，并把其中的文档送入回收站。

## Attachment

附件引用包含 `id`、文件名、MIME、大小、Storage 路径、创建/软删除时间，并预留 `pageNumber`、`quote`、`note`。Blob 先写本地 `attachmentBlobs`；登录且联网时上传私有 Storage，路径为 `user_id/document_id/attachment_id/file_name`。

## Version

版本快照包含文档 ID、文档 version、标题、完整 root、创建时间与原因。原因包括 interval、important、before-restore 和 conflict；每份文档只保留最近 50 条。

Supabase 对应表为 profiles、folders、documents、document_versions、attachments。所有用户表均启用 RLS，浏览器只使用 Anon/Publishable Key。
