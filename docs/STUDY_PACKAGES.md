# 文献资料包增量导入

知识库的“备份与恢复 → 导入文献资料包”接收 `.rmstudy` 文件，在现有知识库中新增独立导图及节点关联 PDF。完整 `.researchmind` 恢复仍用于替换全库，两种格式不可混用。新增功能需要从当前源码构建；旧安装包不会自动获得入口。

资料包是 ZIP，包含 UTF-8 `manifest.json` 和清单中的 PDF 文件：

```json
{
  "format": "researchmind-study",
  "version": 1,
  "id": "unique-task-and-revision-id",
  "title": "文献调研",
  "root": {
    "id": "root",
    "title": "文献调研",
    "note": "检索日期、范围与证据边界",
    "children": [
      { "id": "paper-1", "title": "论文题名", "children": [] }
    ]
  },
  "papers": [
    {
      "key": "P01",
      "title": "论文题名",
      "file": "pdfs/paper-1.pdf",
      "sha256": "替换为实际文件的64位十六进制SHA256",
      "pageCount": 8,
      "bytes": 123456
    }
  ],
  "links": [{ "nodeId": "paper-1", "paperKey": "P01" }]
}
```

节点必须有包内唯一的非空 `id`、文本 `title` 与 `children` 数组；可选 `note`、`collapsed`、文本 `tags` 和 http(s) `hyperlink`。导入器重建支持的文本字段并生成新节点 ID，不接受任意 HTML 或已有附件记录。示例的摘要、页数和字节数是占位内容，真实包必须与 PDF 完全对应。

`papers[].file` 必须为 `pdfs/` 下的 ASCII 文件名（字母、数字、下划线、连字符、点及 `.pdf` 扩展名）。导入前校验大小、PDF 文件头和 SHA-256。资料包和解压后 PDF 总量上限分别为 512 MiB，单 PDF 上限 128 MiB。只有链接、未下载全文的论文保留普通节点和原文链接，不加入 `papers` 或 `links`。

全部校验通过后，在同一个 IndexedDB 事务内新增导图、PDF 和关联；失败时回滚新增记录。导入不删除已有记录，PDF 按 checksum 复用。界面先刷新本地草稿，再暂停保存并重新读取增量结果，以保留现有文档与撤销历史。

`id` 是重复导入标识：同一个包 ID 已有关联导图时不重复添加。修订资料应使用新的 ID；当前功能不会自动合并修订到旧导图。用户把已导入导图移到回收站后，重复导入仍识别为已存在，可从回收站恢复；永久删除后允许重新导入。

服务器上的 Harness 可以按此格式离线生成包，再由用户在笔记本导入。此入口不等于自动同步或实时任务 API，当前代码没有接入 Harness 或千问服务。不要把 PDF、个人调研内容、资料包或数据库提交至公开源码仓库；`.rmstudy` 已加入 Git 忽略规则。

验证入口：`src/services/backup/studyPackage.test.ts` 覆盖增量、校验失败和事务回滚；`e2e/study-package.spec.ts` 覆盖界面导入、旧资料保留、重复导入、正文阅读与刷新持久化。均使用隔离合成数据。
