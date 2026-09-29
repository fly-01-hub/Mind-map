# 快捷键

## 大纲编辑

| 快捷键 | 操作 |
| --- | --- |
| Enter | 在光标处拆分当前主题并插入同级主题 |
| Shift + Enter | 主题内换行 |
| Tab | 把当前主题缩进为上一主题的下级 |
| Shift + Tab | 提升一级 |
| 行首 Backspace | 与上一条可见主题合并 |
| Ctrl + Shift + Backspace | 删除当前主题及其下级 |
| ↑ / ↓ | 在文本边界移动到上一条 / 下一条主题 |
| Ctrl + C / X / V | 复制 / 剪切 / 粘贴子树 |
| Ctrl + D | 创建子树副本 |
| Alt + . | 折叠/展开当前节点 |
| Ctrl + Shift + . | 切换同级节点的下级内容 |
| Ctrl + ] | 进入当前主题 Focus Mode |
| Ctrl + Z | 撤销 |
| Ctrl + Y / Ctrl + Shift + Z | 重做 |
| Ctrl + F | 打开搜索入口 |
| ? | 打开操作指南与快捷键 |
| Escape | 取消选择/关闭当前操作 |

## 导图编辑

- Enter：提交编辑并创建同级节点
- Shift + Enter：节点内换行
- Escape：结束编辑
- 输入法组合期间的 Enter 只确认候选词，不执行节点命令。代码同时检查 `KeyboardEvent.isComposing` 和 `compositionstart/compositionend`。

## 文件拖放

- 把 PDF 拖到某个主题：在该主题下创建论文子节点并关联原始 PDF。
- 把 PDF 拖到画布空白处：优先添加到当前选中主题；没有选中主题时添加到根主题。
- 图片和其他文件拖到主题：作为普通附件保存在该主题中。

## PDF 阅读模式

| 快捷键 | 操作 |
| --- | --- |
| Ctrl + F | 打开论文全文搜索 |
| Ctrl + + / Ctrl + = | 放大页面 |
| Ctrl + - | 缩小页面 |
| ↑ / ← | 上一页 |
| ↓ / → | 下一页 |
| Escape | 关闭搜索或文字选择工具栏 |
