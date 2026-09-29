import type { NodeData } from '../types/mindmap'

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

export function createNode(title = '新主题'): NodeData {
  const timestamp = now()
  return {
    id: uid(), title, children: [], collapsed: false, order: 0,
    createdAt: timestamp, updatedAt: timestamp, style: {}, tags: [],
    taskStatus: 'none', note: '', attachments: [],
  }
}

export function normalizeOrders(node: NodeData): NodeData {
  return {
    ...node,
    children: node.children.map((child, index) =>
      normalizeOrders({ ...child, order: index }),
    ),
  }
}

export function findNode(root: NodeData, id: string): NodeData | undefined {
  if (root.id === id) return root
  for (const child of root.children) {
    const match = findNode(child, id)
    if (match) return match
  }
}

export interface ParentMatch { parent: NodeData; index: number }

export function findParent(root: NodeData, id: string): ParentMatch | undefined {
  const index = root.children.findIndex((child) => child.id === id)
  if (index >= 0) return { parent: root, index }
  for (const child of root.children) {
    const match = findParent(child, id)
    if (match) return match
  }
}

export function mapNode(root: NodeData, id: string, mapper: (node: NodeData) => NodeData): NodeData {
  if (root.id === id) return mapper(root)
  return { ...root, children: root.children.map((child) => mapNode(child, id, mapper)) }
}

export function insertChild(root: NodeData, parentId: string, node = createNode()): NodeData {
  return normalizeOrders(mapNode(root, parentId, (parent) => ({
    ...parent, collapsed: false, updatedAt: now(),
    children: [...parent.children, { ...node, order: parent.children.length }],
  })))
}

export function insertSibling(root: NodeData, nodeId: string, node = createNode()): NodeData {
  if (root.id === nodeId) return insertChild(root, root.id, node)
  const match = findParent(root, nodeId)
  if (!match) return root
  return mapNode(root, match.parent.id, (parent) => {
    const children = [...parent.children]
    children.splice(match.index + 1, 0, node)
    return normalizeOrders({ ...parent, children, updatedAt: now() })
  })
}

export function removeSubtree(root: NodeData, nodeId: string): NodeData {
  if (root.id === nodeId) return root
  return normalizeOrders({
    ...root,
    children: root.children.filter((child) => child.id !== nodeId).map((child) => removeSubtree(child, nodeId)),
  })
}

export function removeSubtrees(root: NodeData, nodeIds: Iterable<string>): NodeData {
  const removed = new Set(nodeIds)
  removed.delete(root.id)
  if (!removed.size) return root
  const prune = (node: NodeData): NodeData => ({
    ...node,
    children: node.children.filter((child) => !removed.has(child.id)).map(prune),
  })
  return normalizeOrders(prune(root))
}

export function removeNodeKeepChildren(root: NodeData, nodeId: string): NodeData {
  if (root.id === nodeId) return root
  const match = findParent(root, nodeId)
  if (!match) return root
  return mapNode(root, match.parent.id, (parent) => {
    const target = parent.children[match.index]
    const children = [...parent.children]
    children.splice(match.index, 1, ...target.children)
    return normalizeOrders({ ...parent, children, updatedAt: now() })
  })
}

export function promoteNode(root: NodeData, nodeId: string): NodeData {
  const parentMatch = findParent(root, nodeId)
  if (!parentMatch || parentMatch.parent.id === root.id) return root
  const grandMatch = findParent(root, parentMatch.parent.id)
  if (!grandMatch) return root
  const target = parentMatch.parent.children[parentMatch.index]
  const withoutTarget = mapNode(root, parentMatch.parent.id, (parent) => ({
    ...parent, children: parent.children.filter((child) => child.id !== nodeId),
  }))
  return mapNode(withoutTarget, grandMatch.parent.id, (grandParent) => {
    const parentIndex = grandParent.children.findIndex((child) => child.id === parentMatch.parent.id)
    const children = [...grandParent.children]
    children.splice(parentIndex + 1, 0, target)
    return normalizeOrders({ ...grandParent, children, updatedAt: now() })
  })
}

export function indentNode(root: NodeData, nodeId: string): NodeData {
  const match = findParent(root, nodeId)
  if (!match || match.index === 0) return root
  const target = match.parent.children[match.index]
  const previous = match.parent.children[match.index - 1]
  const withoutTarget = mapNode(root, match.parent.id, (parent) => ({
    ...parent,
    children: parent.children.filter((child) => child.id !== nodeId),
    updatedAt: now(),
  }))
  return normalizeOrders(mapNode(withoutTarget, previous.id, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, target],
    updatedAt: now(),
  })))
}

export function splitNode(root: NodeData, nodeId: string, before: string, after: string): { root: NodeData; newId?: string } {
  if (!findNode(root, nodeId)) return { root }
  const next = createNode(after)
  const updated = mapNode(root, nodeId, (node) => ({ ...node, title: before, updatedAt: now() }))
  return { root: insertSibling(updated, nodeId, next), newId: next.id }
}

export function mergeNodeInto(root: NodeData, nodeId: string, targetId: string): NodeData {
  if (nodeId === root.id || nodeId === targetId) return root
  const source = findNode(root, nodeId)
  const target = findNode(root, targetId)
  if (!source || !target || findNode(source, targetId)) return root
  const removed = removeSubtree(root, nodeId)
  return normalizeOrders(mapNode(removed, targetId, (node) => ({
    ...node,
    title: `${node.title}${source.title}`,
    collapsed: false,
    children: [...node.children, ...source.children],
    updatedAt: now(),
  })))
}

export function cloneSubtree(node: NodeData): NodeData {
  const timestamp = now()
  return {
    ...node, id: uid(), createdAt: timestamp, updatedAt: timestamp,
    children: node.children.map(cloneSubtree),
    attachments: node.attachments.map((attachment) => ({ ...attachment })),
  }
}

export function duplicateSubtree(root: NodeData, nodeId: string): { root: NodeData; newId?: string } {
  const node = findNode(root, nodeId)
  if (!node) return { root }
  const copy = cloneSubtree(node)
  return { root: insertSibling(root, nodeId, copy), newId: copy.id }
}

export function moveSubtree(root: NodeData, nodeId: string, newParentId: string, index?: number): NodeData {
  if (nodeId === root.id) return root
  const node = findNode(root, nodeId)
  const newParent = findNode(root, newParentId)
  if (!node || !newParent || findNode(node, newParentId)) return root
  const removed = removeSubtree(root, nodeId)
  return normalizeOrders(mapNode(removed, newParentId, (parent) => {
    const children = [...parent.children]
    const safeIndex = Math.max(0, Math.min(index ?? children.length, children.length))
    children.splice(safeIndex, 0, node)
    return { ...parent, collapsed: false, children, updatedAt: now() }
  }))
}

export function moveSubtreeRelative(root: NodeData, nodeId: string, targetId: string, position: 'before' | 'inside' | 'after'): NodeData {
  if (nodeId === targetId || nodeId === root.id) return root
  if (position === 'inside') return moveSubtree(root, nodeId, targetId)
  const source = findNode(root, nodeId)
  const target = findNode(root, targetId)
  const targetParent = findParent(root, targetId)
  if (!source || !target || !targetParent || findNode(source, targetId)) return root
  const removed = removeSubtree(root, nodeId)
  const nextTarget = findParent(removed, targetId)
  if (!nextTarget) return root
  const insertionIndex = nextTarget.index + (position === 'after' ? 1 : 0)
  return normalizeOrders(mapNode(removed, nextTarget.parent.id, (parent) => {
    const children = [...parent.children]
    children.splice(insertionIndex, 0, source)
    return { ...parent, children, updatedAt: now() }
  }))
}

export function replaceSubtree(root: NodeData, subtree: NodeData): NodeData {
  return mapNode(root, subtree.id, () => subtree)
}

export function getBreadcrumbs(root: NodeData, id: string, path: NodeData[] = []): NodeData[] {
  const next = [...path, root]
  if (root.id === id) return next
  for (const child of root.children) {
    const result = getBreadcrumbs(child, id, next)
    if (result.length) return result
  }
  return []
}

export function expandPathToNode(root: NodeData, id: string): NodeData {
  const path = getBreadcrumbs(root, id)
  if (!path.length) return root
  const ancestors = new Set(path.slice(0, -1).map((node) => node.id))
  const expand = (node: NodeData): NodeData => {
    let changed = ancestors.has(node.id) && node.collapsed
    const children = node.children.map((child) => {
      const next = expand(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, collapsed: ancestors.has(node.id) ? false : node.collapsed, children } : node
  }
  return expand(root)
}

export function countNodes(root: NodeData): number {
  return 1 + root.children.reduce((total, child) => total + countNodes(child), 0)
}
