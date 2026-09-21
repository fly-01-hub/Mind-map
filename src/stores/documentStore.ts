import { create } from 'zustand'
import { mockDocuments } from '../data/mockDocuments'
import type { ClipboardPayload, FolderData, MindMapDocument, NodeData } from '../types/mindmap'
import {
  cloneSubtree, createNode, duplicateSubtree, findNode, insertChild, insertSibling,
  findParent, mapNode, promoteNode, removeNodeKeepChildren, removeSubtree, replaceSubtree,
} from '../utils/tree'
import { useSaveStore } from './saveStore'

export interface HistoryState { past: NodeData[]; future: NodeData[] }

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
  toggleFavorite: (id: string) => void
  createFolder: (name: string, parentId?: string) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveDocument: (documentId: string, folderId?: string) => void
  trashDocument: (id: string) => void
  restoreDocument: (id: string) => void
  removeDocumentFromState: (id: string) => void
  restoreVersion: (documentId: string, title: string, root: NodeData, version: number) => void
  commitTree: (root: NodeData) => void
  replaceFocusedTree: (subtree: NodeData, focusRootId?: string) => void
  insertChild: (parentId: string) => string | undefined
  insertSibling: (nodeId: string) => string | undefined
  promote: (nodeId: string) => void
  remove: (nodeId: string) => void
  removeOnly: (nodeId: string) => void
  duplicate: (nodeId: string) => string | undefined
  updateNode: (nodeId: string, patch: Partial<NodeData>) => void
  toggleSiblingChildren: (nodeId: string) => void
  copy: (nodeId: string) => void
  cut: (nodeId: string) => void
  paste: (parentId: string) => string | undefined
  undo: () => void
  redo: () => void
}

const clone = (node: NodeData): NodeData => structuredClone(node)

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
  const histories = { ...state.histories }
  if (recordHistory) {
    const history = histories[id] ?? { past: [], future: [] }
    histories[id] = { past: [...history.past, clone(current.root)].slice(-50), future: [] }
  }
  useSaveStore.getState().markLocal()
  return { documents: state.documents.map((document) => document.id === id ? next : document), histories }
}

function withRoot(document: MindMapDocument, root: NodeData): MindMapDocument {
  return { ...document, root, version: document.version + 1, updatedAt: new Date().toISOString() }
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
    documents: state.documents.map((document) => document.id === id ? touchDocument(document, { title }) : document),
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
  restoreVersion: (documentId, title, root, version) => set((state) => ({
    documents: state.documents.map((document) => document.id === documentId ? {
      ...document, title, root: clone(root), version: Math.max(document.version, version) + 1, updatedAt: new Date().toISOString(),
    } : document),
  })),
  commitTree: (root) => set((state) => updateActive(state, (document) => withRoot(document, root))),
  replaceFocusedTree: (subtree, focusRootId) => set((state) => updateActive(state, (document) =>
    withRoot(document, focusRootId ? replaceSubtree(document.root, subtree) : subtree))),
  insertChild: (parentId) => {
    const node = createNode()
    set((state) => updateActive(state, (document) => withRoot(document, insertChild(document.root, parentId, node))))
    return node.id
  },
  insertSibling: (nodeId) => {
    const node = createNode()
    set((state) => updateActive(state, (document) => withRoot(document, insertSibling(document.root, nodeId, node))))
    return node.id
  },
  promote: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, promoteNode(document.root, nodeId)))),
  remove: (nodeId) => set((state) => updateActive(state, (document) => withRoot(document, removeSubtree(document.root, nodeId)))),
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
    if (node) set({ clipboard: { mode: 'copy', node: clone(node), sourceId: nodeId } })
  },
  cut: (nodeId) => {
    const document = get().documents.find((item) => item.id === get().activeDocumentId)
    const node = document && findNode(document.root, nodeId)
    if (node && node.id !== document?.root.id) set({ clipboard: { mode: 'cut', node: clone(node), sourceId: nodeId } })
  },
  paste: (parentId) => {
    const clipboard = get().clipboard
    if (!clipboard) return
    const pasted = cloneSubtree(clipboard.node)
    set((state) => updateActive(state, (document) => {
      const base = clipboard.mode === 'cut' ? removeSubtree(document.root, clipboard.sourceId) : document.root
      return withRoot(document, insertChild(base, parentId, pasted))
    }))
    if (clipboard.mode === 'cut') set({ clipboard: undefined })
    return pasted.id
  },
  undo: () => set((state) => {
    const id = state.activeDocumentId
    const document = state.documents.find((item) => item.id === id)
    const history = id ? state.histories[id] : undefined
    if (!id || !document || !history?.past.length) return state
    const previous = history.past.at(-1)!
    useSaveStore.getState().markLocal()
    return {
      documents: state.documents.map((item) => item.id === id ? withRoot(item, clone(previous)) : item),
      histories: { ...state.histories, [id]: { past: history.past.slice(0, -1), future: [clone(document.root), ...history.future] } },
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
      documents: state.documents.map((item) => item.id === id ? withRoot(item, clone(next)) : item),
      histories: { ...state.histories, [id]: { past: [...history.past, clone(document.root)], future: history.future.slice(1) } },
    }
  }),
}))
