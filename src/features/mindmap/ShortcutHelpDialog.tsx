import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Keyboard, MousePointer2, X } from 'lucide-react'

const shortcutGroups = [
  {
    title: '创建与编辑',
    items: [
      ['Enter', '新建同级主题'],
      ['Tab', '缩进为上一主题的下级'],
      ['Shift + Tab', '提升一级'],
      ['行首 Backspace', '与上一主题合并'],
      ['Ctrl + Shift + Backspace', '删除主题及下级'],
    ],
  },
  {
    title: '整理与查找',
    items: [
      ['Ctrl + D', '复制当前分支'],
      ['Ctrl + F', '搜索节点'],
      ['Ctrl + ]', '聚焦当前分支'],
      ['Alt + .', '折叠或展开下级'],
    ],
  },
  {
    title: '历史',
    items: [
      ['Ctrl + Z', '撤销'],
      ['Ctrl + Y', '重做'],
      ['Esc', '退出编辑或清除选择'],
      ['?', '打开本帮助'],
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
              <div><strong>大纲优先</strong><span>在大纲中按 Enter 连续输入，Tab / Shift + Tab 调整层级；拖动主题左侧把手可排序或改变父级。选中文字后可直接替换或按 Backspace 删除。顶部可随时切换到导图。</span></div>
            </section>
            <section className="shortcut-feature">
              <FileText size={18} />
              <div><strong>导图浏览</strong><span>导图中双击主题编辑，按住鼠标中键平移画布。论文能力暂时保留但不再作为主要流程，先保证大纲与导图的结构编辑稳定一致。</span></div>
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
