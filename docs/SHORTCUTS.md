# 快捷键

## 大纲编辑

| 快捷键 | 操作 |
| --- | --- |
| Enter | 在光标处拆分当前主题并插入同级主题 |
| Shift + Enter | 进入 / 退出当前主题的描述区 |
| Tab | 把当前主题缩进为上一主题的下级 |
| Shift + Tab | 提升一级 |
| 行首 Backspace | 与上一条可见主题合并 |
| Ctrl + Shift + Backspace | 删除当前主题及其下级 |
| Ctrl + 点击圆点 | 增减一个多选主题 |
| Shift + 点击圆点 | 连续选择两个主题之间的可见主题 |
| ↑ / ↓ | 在文本边界移动到上一条 / 下一条主题 |
| Ctrl + C / X / V | 复制 / 剪切 / 粘贴子树 |
| Ctrl + D | 创建子树副本 |
| Ctrl + Shift + L | 添加 / 取消待办 |
| Ctrl + Shift + K | 完成 / 取消完成 |
| Ctrl + Shift + ↑ / ↓ | 当前主题在同级中上移 / 下移 |
| Alt + . | 折叠/展开当前节点 |
| Ctrl + Shift + . | 切换同级节点的下级内容 |
| Ctrl + ] | 进入当前主题 Focus Mode |
| Ctrl + [ | 返回上一级主题 |
| Ctrl + Z | 撤销 |
| Ctrl + Y / Ctrl + Shift + Z | 重做 |
| Ctrl + F | 打开搜索入口 |
| Ctrl + / | 打开操作指南与快捷键 |
| Ctrl + Alt + Shift + M | 切换大纲 / 思维导图 |
| Ctrl + Alt + Shift + P | 进入 / 退出演示模式 |
| Escape | 取消选择/关闭当前操作 |

选中文字后会出现局部格式工具栏，可设置粗体、斜体、下划线、删除线、文字颜色、高亮、链接、行内代码和挖空。多选主题后，底部批量栏可复制、剪切、粘贴、切换完成状态、折叠或删除；拖动任一已选主题会整体移动。

局部文字也可使用 `Ctrl+B/I/U`、`Ctrl+Enter`、`Ctrl+K`、`Ctrl+Shift+X`、`Alt+L` 与 `Alt+D/R/Y/G/B/P`。鼠标拖选后的选区始终保留在当前主题中，可直接按 Backspace/Delete 批量删除。

## 导图编辑

- Enter：提交编辑并创建同级节点
- Tab：创建下级节点；Shift + Tab：提升当前节点
- Shift + Enter：进入右侧描述编辑区
- Escape：结束编辑
- Shift + 点击主题、Shift + ↑/↓：连续多选；从画布空白处拖动：框选主题
- Ctrl + A：选择当前导图全部可见主题
- Ctrl + C/X/V/D：复制、剪切、粘贴或创建分支副本；多选时复制/剪切整组主题
- Ctrl + Shift + L/K：添加待办、完成或取消完成；Ctrl + Shift + ↑/↓：同级主题移动
- Alt/Ctrl + .：折叠当前主题；Ctrl + Shift + .：折叠同级主题；Ctrl + Alt + 1/2/3：显示当前分支到指定层级
- Ctrl + B/I/U、Ctrl + Enter、Alt + D/R/Y/G/B/P：设置整主题样式；编辑时作用于选中的局部文字
- Alt + L、Ctrl + Shift + X：编辑时把选中文字设为行内代码或挖空
- Alt + Enter：给当前主题添加完全保存在本地的图片
- 双击主题：按点击位置进入文字编辑；中键拖动：平移画布
- 多选相邻同级主题后可创建概要；选择一个主题后点击“连接”，再点目标主题即可创建连接线
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
