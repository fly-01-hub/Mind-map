# 路线图

- [x] Phase 0：环境、Git、技术核验
- [x] Phase 1：React + TypeScript + Vite 最小应用
- [x] Phase 2：Library / Editor 与 Mock 数据
- [x] Phase 3：右向树、快捷键、输入法、快捷按钮、折叠、右键菜单、拖拽、undo/redo、Focus Mode
- [x] Phase 4：Node Inspector、Markdown、标签、链接、备注、图标、图片、PDF 与附件
- [x] Phase 5：Dexie/IndexedDB、自动保存、刷新恢复、文档管理
- [x] Phase 6：完整本地数据库、二进制资料保存与历史版本
- [x] Phase 7：全文搜索、历史版本、回收站、收藏、标签与嵌套文件夹
- [x] Phase 8：完整 2× PNG、Markdown 导入/导出
- [x] Phase 9：核心单元测试、数据迁移测试、关键 Playwright E2E 与 500 节点性能验收
- [x] Phase 10：视觉收口、路由/Inspector 拆包、可访问名称与错误状态
- [x] Phase 11：移除账号与云数据库依赖，加入 `.researchmind` 完整备份/恢复

## 科研文献工作流

- [x] Paper 数据模型、PDF 上传、内容哈希去重与本地保存
- [x] PDF.js 分页阅读、搜索、缩放、快捷键和阅读位置恢复
- [x] 文字选择、高亮、下划线、批注和刷新恢复
- [x] 标注生成思维导图节点及来源关系
- [x] 节点与 PDF 标注双向跳转、页码定位和目标高亮
- [x] 阅读器 UI 收口、笔记栏切换、本页筛选和全量回归

旧科研路线暂缓，先完成下面的大纲优先重构；现有论文资料与阅读能力继续保留。

## 大纲优先重构（当前主线）

- [x] Phase A：建立大纲与导图共用的单一 `NodeData` 数据源
- [x] Phase B：默认大纲编辑、Enter 拆分、Tab 缩进、Shift+Tab 提升、行首合并、跨主题导航
- [x] Phase C：大纲折叠、待办状态、拖动排序/换父级和双视图即时切换
- [x] Phase D：基于文字选区的局部富文本（粗体、斜体、下划线、颜色、高亮、链接、代码、挖空）
- [x] Phase E：多选主题、批量移动/复制/删除、主题编号和完整剪贴板语义
- [ ] Phase F：描述、图片、表格、公式、标签和附件在大纲/导图中的一致呈现
- [ ] Phase G：导图结构与配色面板、概要、跨主题连接线、演示/阅读/专注模式
- [ ] Phase H：XMind、FreeMind、OPML、Markdown、HTML、图片和 PDF 的完整导入导出矩阵
- [ ] Phase I：替换 Mind Elixir，消除第三方导图交互限制，并完成大规模文档性能与可访问性验收
- [ ] Phase J：重新接入本地论文阅读流程，确保它不破坏大纲核心体验

所有阶段默认只读写本机 IndexedDB 和用户主动选择的备份文件；不加入账号、云数据库、遥测、广告或付费 API。此前“真实 AI 服务端代理”不再属于默认产品路线，除非用户未来明确要求独立可选扩展。
