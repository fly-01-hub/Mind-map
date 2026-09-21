# 快捷键

## 浏览状态

| 快捷键 | 操作 |
| --- | --- |
| Enter | 插入同级；根节点上等同插入下级 |
| Tab | 插入下级并立即编辑 |
| Shift + Tab | 提升一级 |
| Ctrl + C / X / V | 复制 / 剪切 / 粘贴子树 |
| Ctrl + D | 创建子树副本 |
| Delete / Backspace | 删除节点及子树（根节点受保护） |
| Alt + . | 折叠/展开当前节点 |
| Ctrl + Shift + . | 切换同级节点的下级内容 |
| Ctrl + ] | 进入当前主题 Focus Mode |
| Ctrl + Z | 撤销 |
| Ctrl + Y / Ctrl + Shift + Z | 重做 |
| Ctrl + F | 打开搜索入口 |
| Escape | 取消选择/关闭当前操作 |

## 编辑状态

- Enter：提交编辑并创建同级节点
- Shift + Enter：节点内换行
- Escape：结束编辑
- 输入法组合期间的 Enter 只确认候选词，不执行节点命令。代码同时检查 `KeyboardEvent.isComposing` 和 `compositionstart/compositionend`。
