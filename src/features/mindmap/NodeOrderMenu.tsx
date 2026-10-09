import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUpDown } from 'lucide-react'
import { reorderSiblings, type NodeOrderAction } from '../../utils/nodeOrder'
import type { NodeData } from '../../types/mindmap'

import { nodeOrderItems } from './nodeOrderItems'

export function NodeOrderMenu({ root, nodeIds, onMove, open, onOpenChange }: {
  root: NodeData; nodeIds: string[]; onMove: (action: NodeOrderAction) => void
  open: boolean; onOpenChange: (open: boolean) => void
}) {
  return <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
    <DropdownMenu.Trigger asChild><button className="toolbar-action-button" aria-label="调整主题顺序" title="调整同级顺序，整条下级分支随主题移动"><ArrowUpDown size={16} /><span>顺序</span></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content node-order-menu" align="end" collisionPadding={12}>
      <DropdownMenu.Label className="dropdown-label">同级排序 · 下级分支一起移动</DropdownMenu.Label>
      {nodeOrderItems.map(({ action, label, icon: Icon }) => <DropdownMenu.Item key={action} className="dropdown-item" disabled={reorderSiblings(root, nodeIds, action) === root} onSelect={() => onMove(action)}><Icon size={16} />{label}</DropdownMenu.Item>)}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
