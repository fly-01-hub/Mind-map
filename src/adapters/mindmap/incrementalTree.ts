import type { NodeData } from '../../types/mindmap'

const contentKeys = ['title', 'richText', 'style', 'tags', 'taskStatus', 'hyperlink', 'note', 'code', 'formula', 'icon', 'image', 'table', 'attachments'] as const
const contentCache = new WeakMap<NodeData, string>()
function contentKey(node: NodeData) {
  let key = contentCache.get(node)
  if (key === undefined) {
    key = JSON.stringify(contentKeys.map((field) => node[field]))
    contentCache.set(node, key)
  }
  return key
}
export function sameNodeContent(left: NodeData, right: NodeData) {
  return left === right || contentKeys.every((key) => left[key] === right[key]) || contentKey(left) === contentKey(right)
}

export interface TreePatch {
  updates: NodeData[]
  toggles: NodeData[]
  insertion?: { parentId: string; node: NodeData; beforeId?: string }
  removal?: string
}

// Only patch small, unambiguous edits. Reparenting, imports, summaries and large
// changes use the engine's complete layout, rather than guessing about structure.
export function incrementalTree(previous: NodeData, next: NodeData): TreePatch | undefined {
  const patch: TreePatch = { updates: [], toggles: [] }
  const visit = (before: NodeData, after: NodeData): boolean => {
    if (before === after) return true
    if (before.id !== after.id) return false
    if (!sameNodeContent(before, after)) patch.updates.push(after)
    if (before.collapsed !== after.collapsed) patch.toggles.push(after)
    // Multiple toggles can hide a later target while applying the first one.
    // Full layout handles ancestor/descendant combinations atomically.
    if (patch.toggles.length > 1 || patch.updates.length + patch.toggles.length > 8) return false
    const oldChildren = before.children
    const children = after.children
    if (oldChildren.length === children.length) return children.every((child, index) => visit(oldChildren[index], child))
    if (patch.insertion || patch.removal || Math.abs(children.length - oldChildren.length) !== 1) return false
    const adding = children.length > oldChildren.length
    const longer = adding ? children : oldChildren
    const shorter = adding ? oldChildren : children
    const index = longer.findIndex((child, i) => child.id !== shorter[i]?.id)
    const changed = longer[index]
    if (changed.children.length || after.collapsed || before.collapsed) return false
    if (adding) patch.insertion = { parentId: after.id, node: changed, beforeId: children[index + 1]?.id }
    else patch.removal = changed.id
    return shorter.every((child, i) => {
      const other = longer[i < index ? i : i + 1]
      return adding ? visit(child, other) : visit(other, child)
    })
  }
  return visit(previous, next) ? patch : undefined
}
