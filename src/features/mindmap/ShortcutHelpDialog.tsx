import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Keyboard, MousePointer2, X } from 'lucide-react'

const shortcutGroups = [
  {
    title: '创建与编辑',
    items: [
      ['Enter', '新建同级主题'],
      ['Tab', '新建子主题'],
      ['Shift + Tab', '提升一级'],
      ['Delete', '删除主题及下级'],
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
          <Dialog.Description>选中主题后直接使用键盘，可以连续、快速地搭建知识结构。</Dialog.Description>
          <div className="shortcut-guide">
            <section className="shortcut-feature">
              <MousePointer2 size={18} />
              <div><strong>选择与拖动</strong><span>单击选择主题；拖动主题可调整父级；右键打开完整命令菜单。</span></div>
            </section>
            <section className="shortcut-feature">
              <FileText size={18} />
              <div><strong>把论文放进导图</strong><span>从资源管理器把 PDF 拖到任意主题，松开后会自动创建论文子节点。</span></div>
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
