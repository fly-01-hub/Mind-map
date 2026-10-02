import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  CheckSquare, ChevronRight, Clipboard, Copy, FilePlus2, Focus, Link2,
  MessageSquareText, Palette, Scissors, Tags, Trash2, UnfoldVertical,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type NodeCommand =
  | 'sibling' | 'child' | 'promote' | 'copy' | 'cut' | 'paste' | 'duplicate'
  | 'removeOnly' | 'remove' | 'toggle' | 'toggleSiblings' | 'focus' | 'link'
  | 'note' | 'task' | 'tag' | 'icon' | 'image' | 'attachment' | 'formula' | 'code' | 'color'

function Item({ icon, label, shortcut, onSelect, disabled }: { icon?: ReactNode; label: string; shortcut?: string; onSelect: () => void; disabled?: boolean }) {
  return <ContextMenu.Item className="context-item" onSelect={onSelect} disabled={disabled}>{icon}<span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</ContextMenu.Item>
}

export function NodeContextMenu({ children, onCommand, isRoot, hasClipboard, disabled }: {
  children: ReactNode
  onCommand: (command: NodeCommand) => void
  isRoot: boolean
  hasClipboard: boolean
  disabled?: boolean
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild disabled={disabled}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-content" collisionPadding={12}>
          <Item label="插入同级主题" shortcut="Enter" onSelect={() => onCommand('sibling')} />
          <Item label="插入下级主题" shortcut="Tab" onSelect={() => onCommand('child')} />
          <Item label="提升一级" shortcut="Shift + Tab" disabled={isRoot} onSelect={() => onCommand('promote')} />
          <ContextMenu.Separator className="context-separator" />
          <Item icon={<Copy />} label="复制" shortcut="Ctrl + C" onSelect={() => onCommand('copy')} />
          <Item icon={<Scissors />} label="剪切" shortcut="Ctrl + X" disabled={isRoot} onSelect={() => onCommand('cut')} />
          <Item icon={<Clipboard />} label="粘贴为下级" shortcut="Ctrl + V" disabled={!hasClipboard} onSelect={() => onCommand('paste')} />
          <Item icon={<FilePlus2 />} label="创建副本" shortcut="Ctrl + D" onSelect={() => onCommand('duplicate')} />
          <Item label="仅删除当前主题" disabled={isRoot} onSelect={() => onCommand('removeOnly')} />
          <Item icon={<Trash2 />} label="删除主题及下级" shortcut="Delete" disabled={isRoot} onSelect={() => onCommand('remove')} />
          <ContextMenu.Separator className="context-separator" />
          <Item icon={<UnfoldVertical />} label="折叠 / 展开下级" shortcut="Alt + ." onSelect={() => onCommand('toggle')} />
          <Item label="切换同级主题的下级" shortcut="Ctrl + Shift + ." onSelect={() => onCommand('toggleSiblings')} />
          <Item icon={<Focus />} label="进入此主题" shortcut="Ctrl + ]" onSelect={() => onCommand('focus')} />
          <ContextMenu.Separator className="context-separator" />
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="context-item"><Palette /><span>丰富内容</span><ChevronRight className="context-chevron" /></ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="context-content context-subcontent">
                <Item icon={<Link2 />} label="添加链接" onSelect={() => onCommand('link')} />
                <Item icon={<MessageSquareText />} label="添加笔记" onSelect={() => onCommand('note')} />
                <Item icon={<CheckSquare />} label="添加待办" onSelect={() => onCommand('task')} />
                <Item icon={<Tags />} label="添加标签" onSelect={() => onCommand('tag')} />
                <Item label="添加图标" onSelect={() => onCommand('icon')} />
                <Item label="添加图片" onSelect={() => onCommand('image')} />
                <Item label="添加附件" onSelect={() => onCommand('attachment')} />
                <Item label="添加数学公式" onSelect={() => onCommand('formula')} />
                <Item label="添加代码" onSelect={() => onCommand('code')} />
                <Item icon={<Palette />} label="设置颜色" onSelect={() => onCommand('color')} />
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
