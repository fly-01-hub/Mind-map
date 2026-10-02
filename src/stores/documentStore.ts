import { create } from 'zustand'
import { mockDocuments } from '../data/mockDocuments'
import type { ClipboardPayload, FolderData, MapArrow, MapSummary, MindMapDocument, NodeData } from '../types/mindmap'
import {
  cloneSubtree, createNode, duplicateSubtree, findNode, insertChild, insertSibling,
  expandPathToNode, findParent, indentNode, mapNode, mergeNodeInto, moveSubtreeRelative, promoteNode,
  moveSubtreesRelative, removeNodeKeepChildren, removeSubtree, removeSubtrees, replaceSubtree,
  splitNode, topLevelSelectedNodes,
} from '../utils/tree'
import { useSaveStore } from './saveStore'

interface DocumentSnapshot { root: NodeData; arrows: MapArrow[]; summaries: MapSummary[] }
export interface HistoryState { past: DocumentSnapshot[]; future: DocumentSnapshot[] }

export interface DocumentState {
  documents: MindMapDocument[]
  folders: FolderData[]
  activeDocumentId?: string
  hydrated: boolean
  histories: Record<string, HistoryState>
  clipboard?: ClipboardPayload
  openDocument: (id: string) => void
  hydrate: (documents: MindMapDocument[], folders: FolderData[]) => void
  createDocument: (title?: string) => MindMapDocument
  renameDocument: (id: string, title: string) => void
  updateMapAppearance: (id: string, appearance: Pick<MindMapDocument, 'mapTheme' | 'compactMap'>) => void
  toggleFavorite: (id: string) => void
  createFolder: (name: string, parentId?: string) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveDocument: (documentId: string, folderId?: string) => void
  trashDocument: (id: string) => void
  restoreDocument: (id: string) => void
  removeDocumentFromState: (id: string) => void
  restoreVersion: (documentId: string, title: string, root: NodeData, version: number, arrows?: MapArrow[], summaries?: MapSummary[]) => void
  commitTree: (root: NodeData) => void
  commitMap: (root: NodeData, arrows: MapArrow[], summaries: MapSummary[]) => void
  replaceFocusedTree: (subtree: NodeData, focusRootId?: string) => void
  insertChild: (parentId: string, title?: string) => string | undefined
  insertSibling: (nodeId: string, title?: string) => string | undefined
  split: (nodeId: string, before: string, after: string, beforeRichText?: string, afterRichText?: string) => string | undefined
  indent: (nodeId: string) => void
  promote: (nodeId: string) => void
  mergeInto: (nodeId: string, targetId: string) => void
  moveRelative: (nodeId: string, targetId: string, position: 'before' | 'inside' | 'after') => void
  moveManyRelative: (nodeIds: string[], targetId: string, position: 'before' | 'inside' | 'after') => void
  toggleCollapsed: (nodeId: string) => void
  remove: (nodeId: string) => void
  removeMany: (nodeIds: string[]) => void
  removeOnly: (nodeId: string) => void
  duplicate: (nodeId: string) => string | undefined
  updateNode: (nodeId: string, patch: Partial<NodeData>) => void
  updateMany: (nodeIds: string[], patch: Partial<NodeData> | ((node: NodeData) => Partial<NodeData>)) => void
  addArrow: (fromId: string, toId: string, label?: string) => string | undefined
  addSummary: (nodeIds: string[], label?: string) => string | undefined
  revealNode: (nodeId: string) => void
  toggleSiblingChildren: (nodeId: string) => void
  copy: (nodeId: string) => void
  cut: (nodeId: string) => void
  copyMany: (nodeIds: string[]) => void
  cutMany: (nodeIds: string[]) => void
  paste: (parentId: string) => string | undefined
  undo: () => void
  redo: () => void
}

const clone = (node: NodeData): NodeData => structuredClone(node)
const snapshot = (document: MindMapDocument): DocumentSnapshot => structuredClone({
  root: document.root,
  arrows: document.arrows ?? [],
  summaries: document.summaries ?? [],
})

function updateActive(
  state: DocumentState,
  transform: (document: MindMapDocument) => MindMapDocument,
  recordHistory = true,
): Partial<DocumentState> {
  const id = state.activeDocumentId
  if (!id) return {}
  const current = state.documents.find((document) => document.id === id)
  if (!current) return {}
  const next = transform(current)
  if (next === current) return {}
  const histories = { ...state.histories }
  if (recordHistory) {
    const history = histories[id] ?? { past: [], future: [] }
    histories[id] = { past: [...history.past, snapshot(current)].slice(-50), future: [] }
  }
  useSaveStore.getState().markLocal()
  return { documents: state.documents.map((document) => document.id === id ? next : document), histories }
}

function withRoot(document: MindMapDocument, root: NodeData): MindMapDocument {
  const ids = new Set<string>()
  const collect = (node: NodeData) => {
    ids.add(node.id)
    node.children.forEach(collect)
  }
  collect(root)
  const arrows = (document.arrows ?? []).filter((arrow) => ids.has(arrow.from) && ids.has(arrow.to))
  const summaries = (document.summaries ?? []).flatMap((summary) => {
    if (summary.nodeIds?.length) {
      const matches = summary.nodeIds.map((id) => findParent(root, id))
      if (matches.some((match) => !match)) return []
      const parentId = matches[0]!.parent.id
      if (matches.some((match) => match!.parent.id !== parentId)) return []
      const indexes = matches.map((match) => match!.index).sort((a, b) => a - b)
      if (indexes.at(-1)! - indexes[0] + 1 !== indexes.length) return []
      return [{ ...summary, parent: parentId, start: indexes[0], end: indexes.at(-1)! }]
    }
    const parent = findNode(root, summary.parent)
    return parent && summary.start >= 0 && summary.end < parent.children.length ? [summary] : []
  })
  return { ...document, root, arrows, summaries, version: document.version + 1, updatedAt: new Date().toISOString() }
}

function touchDocument(document: MindMapDocument, patch: Partial<MindMapDocument>): MindMapDocument {
  return { ...document, ...patch, version: document.version + 1, updatedAt: new Date().toISOString() }
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: mockDocuments,
  folders: [
    { id: 'research', name: '科研资料', order: 0, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' },
    { id: 'writing', name: '创作计划', order: 1, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' },
  ],
  hydrated: false,
  histories: {},
  openDocument: (activeDocumentId) => set({ activeDocumentId }),
  hydrate: (documents, folders) => set({ documents, folders, hydrated: true }),
  createDocument: (title = '未命名思维导图') => {
    const timestamp = new Date().toISOString()
    const document: MindMapDocument = {
      id: crypto.randomUUID(), title, root: createNode(title), isFavorite: false,
      version: 1, createdAt: timestamp, updatedAt: timestamp,
    }
    set((state) => ({ documents: [document, ...state.documents], activeDocumentId: document.id }))
    return document
  },
  renameDocument: (id, title) => set((state) => ({
    documents: state.documents.map((document) => document.id === id ? touchDocument(document, {
      title,
      root: { ...document.root, title, updatedAt: new Date().toISOString() },
    }) : document),
  })),
  updateMapAppearance: (id, appearance) => set((state) => ({
    documents: state.documents.map((document) => document.id === id ? touchDocument(document, appearance) : document),
  })),
  toggleFavorite: (id) => set((state) => ({
    documents: state.documents.map((document) => document.id === id ? touchDocument(document, { isFavorite: !document.isFavorite }) : document),
  })),
  createFolder: (name, parentId) => {
    const timestamp = new Date().toISOString()
    const folder: FolderData = {
      id: crypto.randomUUID(), name, parentId, order: get().folders.filter((item) => item.parentId === parentId).length,
      createdAt: timestamp, updatedAt: timestamp,
    }
    set((state) => ({ folders: [...state.folders, folder] }))
    return folder.id
  },
  renameFolder: (id, name) => set((state) => ({ folders: state.folders.map((folder) => folder.id === id ? { ...folder, name, updatedAt: new Date().toISOString() } : folder) })),
  deleteFolder: (id) => set((state) => {
    const affected = new Set<string>([id])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const folder of state.folders) {
        if (folder.parentId && affected.has(folder.parentId) && !affected.has(folder.id)) {
          affected.add(folder.id)
          expanded = true
        }
      }
    }
    const deletedAt = new Date().toISOString()
    return {
      folders: state.folders.map((folder) => affected.has(folder.id) ? { ...folder, deletedAt, updatedAt: deletedAt } : folder),
      documents: state.documents.map((document) => document.folderId && affected.has(document.folderId)
        ? touchDocument(document, { deletedAt }) : document),
    }
  }),
  moveDocument: (documentId, folderId) => set((state) => ({ documents: state.documents.map((document) => document.id === documentId ? touchDocument(document, { folderId }) : document) })),
  trashDocument: (id) => set((state) => ({ documents: state.documents.map((document) => document.id === id ? touchDocument(document, { deletedAt: new Date().toISOString() }) : document) })),
  restoreDocument: (id) => set((state) => ({ documents: state.documents.map((document) => document.id === id ? touchDocument(document, { deletedAt: undefined }) : document) })),
  removeDocumentFromState: (id) => set((state) => ({ documents: state.documents.filter((document) => document.id !== id) })),
  restoreVersion: (documentId, title, root, version, arrows = [], summaries = []) => set((state) => ({
    documents: state.documents.map((document) => document.id === documentId ? {
      ...document, title, root: clone(root), arrows: structuredClone(arrows), summaries: structuredClone(summaries),
      version: Math.max(document.version, version) + 1, updatedAt: new Date().toISOString(),
    } : document),
  })),
  commitTree: (root) => set((state) => updateActive(state, (document) => ({ ...withRoot(document, root), title: root.title }))),
  commitMap: (root, arrows, summaries) => set((state) => updateActive(state, (document) => ({
    ...withRoot(document, root), title: root.title, arrows: structuredClone(arrows), summaries: structuredClone(summaries),
  }))),
  replaceFocusedTree: (subtree, focusRootId) => set((state) => updateActive(state, (document) =>
    withRoot(document, focusRootId ? replaceSubtree(document.root, subtree) : subtree))),
  insertChild: (parentId, title) => {
    const node = createNode(title)
    set((state) => updateActive(state, (document) => withRoot(document, insertChild(document.root, parentId, node))))
    return node.id
  },
  insertSibling: (nodeId, title) => {
    const node = createNode(title)
    set((state) => updateActive(state, (document) => withRoot(document, insertSibling(document.root, nodeId, node))))
    return node.id
  },
  split: (nodeId, before, after, beforeRichText, afterRichText) => {
    const current = get().documents.find((document) => document.id === get().activeDocumentId)
    if (!current) return
    const result = splitNode(current.root, nodeId, before, after, beforeRichText, afterRichText)
    if (!result.newId) return
    set((state) => updateActive(state, (document) => withRoot(document, result.root)))
    return result.newId
  },
  indent: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, indentNode(document.root, nodeId)))),
  promote: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, promoteNode(document.root, nodeId)))),
  mergeInto: (nodeId, targetId) => set((state) => updateActive(state, (document) => withRoot(document, mergeNodeInto(document.root, nodeId, targetId)))),
  moveRelative: (nodeId, targetId, position) => set((state) => updateActive(state, (document) => withRoot(document, moveSubtreeRelative(document.root, nodeId, targetId, position)))),
  moveManyRelative: (nodeIds, targetId, position) => set((state) => updateActive(state, (document) => withRoot(document, moveSubtreesRelative(document.root, nodeIds, targetId, position)))),
  toggleCollapsed: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document,
    mapNode(document.root, nodeId, (node) => ({ ...node, collapsed: !node.collapsed, updatedAt: new Date().toISOString() }))))),
  remove: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, removeSubtree(document.root, nodeId)))),
  removeMany: (nodeIds) => set((state) => updateActive(state, (document) => withRoot(document, removeSubtrees(document.root, nodeIds)))),
  removeOnly: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, removeNodeKeepChildren(document.root, nodeId)))),
  duplicate: (nodeId) => {
    const current = get().documents.find((document) => document.id === get().activeDocumentId)
    if (!current) return
    const result = duplicateSubtree(current.root, nodeId)
    set((state) => updateActive(state, (document) => withRoot(document, result.root)))
    return result.newId
  },
  updateNode: (nodeId, patch) => set((state) => updateActive(state, (document) => withRoot(document,
    mapNode(document.root, nodeId, (node) => ({ ...node, ...patch, updatedAt: new Date().toISOString() }))))),
  updateMany: (nodeIds, patch) => set((state) => updateActive(state, (document) => {
    const ids = new Set(nodeIds)
    const update = (node: NodeData): NodeData => {
      const nextPatch = ids.has(node.id) ? (typeof patch === 'function' ? patch(node) : patch) : undefined
      return {
        ...node,
        ...nextPatch,
        updatedAt: nextPatch ? new Date().toISOString() : node.updatedAt,
        children: node.children.map(update),
      }
    }
    return withRoot(document, update(document.root))
  })),
  addArrow: (fromId, toId, label = '关联') => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    if (!document || fromId === toId || !findNode(document.root, fromId) || !findNode(document.root, toId)) return
    const duplicate = document.arrows?.some((arrow) => arrow.from === fromId && arrow.to === toId)
    if (duplicate) return
    const id = crypto.randomUUID()
    set((state) => updateActive(state, (item) => ({
      ...touchDocument(item, {}),
      arrows: [...(item.arrows ?? []), { id, label, from: fromId, to: toId }],
    })))
    return id
  },
  addSummary: (nodeIds, label = '概要') => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    if (!document || nodeIds.length < 2) return
    const matches = nodeIds.map((id) => findParent(document.root, id))
    if (matches.some((match) => !match)) return
    const parentId = matches[0]!.parent.id
    if (matches.some((match) => match!.parent.id !== parentId)) return
    const indexes = [...new Set(matches.map((match) => match!.index))].sort((a, b) => a - b)
    if (indexes.length < 2 || indexes.at(-1)! - indexes[0] + 1 !== indexes.length) return
    const id = crypto.randomUUID()
    set((state) => updateActive(state, (item) => ({
      ...touchDocument(item, {}),
      summaries: [...(item.summaries ?? []), {
        id, label, parent: parentId, start: indexes[0], end: indexes.at(-1)!,
        nodeIds: indexes.map((index) => matches.find((match) => match!.index === index)!.parent.children[index].id),
      }],
    })))
    return id
  },
  revealNode: (nodeId) => set((state) => updateActive(state, (document) => {
    const root = expandPathToNode(document.root, nodeId)
    return root === document.root ? document : withRoot(document, root)
  }, false)),
  toggleSiblingChildren: (nodeId) => set((state) => updateActive(state, (document) => {
    const match = findParent(document.root, nodeId)
    const siblings = match?.parent.children ?? [document.root]
    const shouldCollapse = siblings.some((node) => node.children.length > 0 && !node.collapsed)
    const ids = new Set(siblings.filter((node) => node.children.length > 0).map((node) => node.id))
    const apply = (node: NodeData): NodeData => ({
      ...node,
      collapsed: ids.has(node.id) ? shouldCollapse : node.collapsed,
      children: node.children.map(apply),
    })
    return withRoot(document, apply(document.root))
  })),
  copy: (nodeId) => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    const node = document && findNode(document.root, nodeId)
    if (node) set({ clipboard: { mode: 'copy', nodes: [clone(node)], sourceIds: [nodeId] } })
  },
  cut: (nodeId) => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    const node = document && findNode(document.root, nodeId)
    if (node && node.id !== document?.root.id) set({ clipboard: { mode: 'cut', nodes: [clone(node)], sourceIds: [nodeId] } })
  },
  copyMany: (nodeIds) => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    if (!document) return
    const nodes = topLevelSelectedNodes(document.root, nodeIds)
    if (nodes.length) set({ clipboard: { mode: 'copy', nodes: nodes.map(clone), sourceIds: nodes.map((node) => node.id) } })
  },
  cutMany: (nodeIds) => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    if (!document) return
    const nodes = topLevelSelectedNodes(document.root, nodeIds)
    if (nodes.length) set({ clipboard: { mode: 'cut', nodes: nodes.map(clone), sourceIds: nodes.map((node) => node.id) } })
  },
  paste: (parentId) => {
    const clipboard = get().clipboard
    if (!clipboard) return
    const current = get().documents.find((item) => item.id === get().activeDocumentId)
    if (!current || (clipboard.mode === 'cut' && clipboard.nodes.some((node) => findNode(node, parentId)))) return
    const pasted = clipboard.nodes.map(cloneSubtree)
    set((state) => updateActive(state, (document) => {
      let root = clipboard.mode === 'cut' ? removeSubtrees(document.root, clipboard.sourceIds) : document.root
      for (const node of pasted) root = insertChild(root, parentId, node)
      return withRoot(document, root)
    }))
    if (clipboard.mode === 'cut') set({ clipboard: undefined })
    return pasted.at(-1)?.id
  },
  undo: () => set((state) => {
    const id = state.activeDocumentId
    const document = state.documents.find((item) => item.id === id)
    const history = id ? state.histories[id] : undefined
    if (!id || !document || !history?.past.length) return state
    const previous = history.past.at(-1)!
    useSaveStore.getState().markLocal()
    return {
      documents: state.documents.map((item) => item.id === id ? {
        ...withRoot(item, clone(previous.root)), arrows: structuredClone(previous.arrows), summaries: structuredClone(previous.summaries),
      } : item),
      histories: { ...state.histories, [id]: { past: history.past.slice(0, -1), future: [snapshot(document), ...history.future] } },
    }
  }),
  redo: () => set((state) => {
    const id = state.activeDocumentId
    const document = state.documents.find((item) => item.id === id)
    const history = id ? state.histories[id] : undefined
    if (!id || !document || !history?.future.length) return state
    const next = history.future[0]
    useSaveStore.getState().markLocal()
    return {
      documents: state.documents.map((item) => item.id === id ? {
        ...withRoot(item, clone(next.root)), arrows: structuredClone(next.arrows), summaries: structuredClone(next.summaries),
      } : item),
      histories: { ...state.histories, [id]: { past: [...history.past, snapshot(document)], future: history.future.slice(1) } },
    }
  }),
}))
