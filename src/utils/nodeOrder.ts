import type { NodeData } from '../types/mindmap'
import { findParent, mapNode } from './tree'

export type NodeOrderAction = 'moveUp' | 'moveDown' | 'moveFirst' | 'moveLast'

/** Reorder siblings only. Keep node identities, metadata and entire subtrees. */
export function reorderSiblings(root: NodeData, nodeIds: Iterable<string>, action: NodeOrderAction): NodeData {
  const ids = [...new Set(nodeIds)]
  const matches = ids.map((id) => findParent(root, id))
  if (!matches.length || matches.some((match) => !match)) return root
  const parent = matches[0]!.parent
  if (matches.some((match) => match!.parent.id !== parent.id)) return root
  const selected = new Set(ids)
  const moving = parent.children.filter((node) => selected.has(node.id))
  const remaining = parent.children.filter((node) => !selected.has(node.id))
  if (!remaining.length) return root
  const indexes = matches.map((match) => match!.index)
  let index: number
  if (action === 'moveFirst') index = 0
  else if (action === 'moveLast') index = remaining.length
  else {
    const target = parent.children[action === 'moveUp' ? Math.min(...indexes) - 1 : Math.max(...indexes) + 1]
    if (!target) return root
    index = remaining.findIndex((node) => node.id === target.id) + (action === 'moveDown' ? 1 : 0)
  }
  const children = [...remaining]
  children.splice(index, 0, ...moving)
  if (children.every((node, i) => node.id === parent.children[i].id)) return root
  return mapNode(root, parent.id, (node) => ({
    ...node, updatedAt: new Date().toISOString(),
    children: children.map((child, order) => child.order === order ? child : { ...child, order }),
  }))
}
