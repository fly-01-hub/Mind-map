import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine } from 'lucide-react'

export const nodeOrderItems = [
  { action: 'moveUp', label: '上移一位', icon: ArrowUp, shortcut: 'Ctrl + Shift + ↑' },
  { action: 'moveDown', label: '下移一位', icon: ArrowDown, shortcut: 'Ctrl + Shift + ↓' },
  { action: 'moveFirst', label: '移到同级首位', icon: ArrowUpToLine },
  { action: 'moveLast', label: '移到同级末位', icon: ArrowDownToLine },
] as const
