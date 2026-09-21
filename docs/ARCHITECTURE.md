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

hover、缩放和平移不进入数据库，也不会触发云同步。富文本 Inspector 按需加载，主路由也按页拆包。

## 本地与云端

Dexie 数据库当前 schema version 为 2，包含 documents、folders、versions、attachmentBlobs 和 meta。迁移会把旧的 text-only 节点补齐为完整 NodeData。每次修改 350ms 防抖写入，活跃文档最多保留 50 个间隔快照。

配置 Supabase 后，登录会先拉取云端文档和文件夹，再合并本地数据。保存按约 1100ms 防抖上传。远端版本更高或同版本内容分叉时，系统先创建“冲突恢复”本地副本，再采用云端版本；离线内容始终保留并在 online 事件后重试。

内置示例文档使用可读 ID，仅保留在本地；用户创建的 UUID 文档和文件夹才会同步云端。

## 引擎与导出

使用 `mind-elixir@6.0.0-next.4` 的公开 API。完整 PNG 由官方 `@mind-elixir/export-mindmap` 插件生成，白底、2×、无水印；Markdown 使用应用自己的可逆格式，以 HTML 注释保存富字段。

## AI 边界

`services/ai/AIProvider.ts` 定义生成脑图、总结、扩写、改写、论文分析、论文比较和子树整理。当前 Mock Provider 不联网。未来真实 Provider 必须通过服务端代理，API Key 不得进入浏览器包。
