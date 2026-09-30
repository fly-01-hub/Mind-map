import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Keyboard, MousePointer2, X } from 'lucide-react'

const shortcutGroups = [
  {
    title: '创建与编辑',
    items: [
      ['Enter', '新建同级主题'],
      ['Tab', '缩进为上一主题的下级'],
      ['Shift + Tab', '提升一级'],
      ['Shift + Enter', '进入或退出描述区'],
      ['行首 Backspace', '与上一主题合并'],
      ['Ctrl + Shift + Backspace', '删除主题及下级'],
    ],
  },
  {
    title: '整理与查找',
    items: [
      ['Ctrl + D', '复制当前分支'],
      ['Ctrl + Shift + L', '添加或取消待办'],
      ['Ctrl + Shift + K', '完成或取消完成'],
      ['Ctrl + Shift + ↑ / ↓', '同级主题上移或下移'],
      ['Ctrl + F', '搜索节点'],
      ['Ctrl + ]', '聚焦当前分支'],
      ['Ctrl + [', '返回上一级主题'],
      ['Alt + .', '折叠或展开下级'],
    ],
  },
  {
    title: '历史',
    items: [
      ['Ctrl + Z', '撤销'],
      ['Ctrl + Shift + Z / Ctrl + Y', '重做'],
      ['Ctrl + Alt + Shift + M', '切换大纲 / 思维导图'],
      ['Ctrl + Alt + Shift + P', '进入或退出演示模式'],
      ['Esc', '退出编辑或清除选择'],
      ['Ctrl + /', '打开本帮助'],
    ],
  },
  {
    title: '文字样式',
    items: [
      ['Ctrl + B / I / U', '粗体 / 斜体 / 下划线'],
      ['Ctrl + Enter', '删除线'],
      ['Ctrl + K', '添加链接'],
      ['Ctrl + Shift + X', '添加或取消挖空'],
      ['Alt + L', '行内代码'],
      ['Alt + D/R/Y/G/B/P', '文字颜色'],
    ],
  },
]

export function ShortcutHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="standard-dialog shortcut-dialog">
          <header>
            <div><p className="eyebrow">快速上手</p><Dialog.Title>操作指南与快捷键</Dialog.Title></div>
            <Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close>
          </header>
          <Dialog.Description>推荐先在大纲中连续输入和整理层级，再切换到思维导图查看全局；两种视图共用同一份本地数据。</Dialog.Description>
          <div className="shortcut-guide">
            <section className="shortcut-feature">
              <MousePointer2 size={18} />
              <div><strong>大纲优先</strong><span>在大纲中按 Enter 连续输入，Tab / Shift + Tab 调整层级，Shift + Enter 编辑主题描述；拖动主题左侧把手可排序或改变父级。选中文字后可直接替换、批量删除或使用悬浮格式栏。</span></div>
            </section>
            <section className="shortcut-feature">
              <FileText size={18} />
              <div><strong>导图浏览</strong><span>导图中双击主题编辑；Shift + 点击或在空白处拖框可多选，按住鼠标中键平移画布。底部主题栏可快速添加同级、下级、待办、描述与连接。</span></div>
            </section>
          </div>
          <div className="shortcut-columns">
            {shortcutGroups.map((group) => <section key={group.title}>
              <h3><Keyboard size={14} />{group.title}</h3>
              {group.items.map(([keys, action]) => <div className="shortcut-row" key={keys}><kbd>{keys}</kbd><span>{action}</span></div>)}
            </section>)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
