import type { FolderData, MindMapDocument, NodeData } from '../../types/mindmap'
import { createNode, findNode, mapNode } from '../../utils/tree'
import { uniqueDocumentName } from '../../utils/wikiLinks'

export const JOURNAL_PREFIX = 'researchmind-recovery-v1:'
type StoredNode = Omit<NodeData, 'children'> & { children?: string[] }
export interface EditorDraft {
  documentId: string
  nodeId: string
  version: number
  patch: Partial<NodeData>
  clearFields?: Array<keyof NodeData>
}
interface DocumentPatch {
  document: Omit<MindMapDocument, 'root'>
  rootId: string
  baseVersion?: number
  baseUpdatedAt?: string
  nodes: StoredNode[]
}
interface JournalData {
  format: 1
  documents: DocumentPatch[]
  folders?: FolderData[]
  drafts: EditorDraft[]
}

const indexes = new WeakMap<NodeData, Map<string, NodeData>>()
function nodeIndex(root: NodeData) {
  let index = indexes.get(root)
  if (!index) {
    index = new Map()
    const visit = (node: NodeData) => { index!.set(node.id, node); node.children.forEach(visit) }
    visit(root)
    indexes.set(root, index)
  }
  return index
}

function makePatch(document: MindMapDocument, previous?: MindMapDocument): DocumentPatch {
  const before = previous && nodeIndex(previous.root)
  const nodes: StoredNode[] = []
  const visit = (node: NodeData) => {
    const previousNode = before?.get(node.id)
    if (previousNode === node) return
    const { children, ...fields } = node
    const childrenChanged = !previousNode || children.length !== previousNode.children.length || children.some((child, index) => child.id !== previousNode.children[index].id)
    const fieldsChanged = !previousNode || (Object.keys(fields) as Array<keyof typeof fields>).some((key) => fields[key] !== previousNode[key])
    if (childrenChanged || fieldsChanged) nodes.push({ ...fields, children: childrenChanged ? children.map((child) => child.id) : undefined })
    children.forEach(visit)
  }
  visit(document.root)
  const { root, ...fields } = document
  return { document: fields, rootId: root.id, baseVersion: previous?.version, baseUpdatedAt: previous?.updatedAt, nodes }
}

export class RecoveryJournal {
  readonly key = JOURNAL_PREFIX + crypto.randomUUID()
  private storage: Storage
  constructor(storage: Storage) { this.storage = storage }

  write(documents: MindMapDocument[], folders: FolderData[], baseline: Map<string, MindMapDocument>, previousFolders: FolderData[] | undefined, drafts: EditorDraft[]) {
    const pending = documents.filter((document) => baseline.get(document.id) !== document)
    if (!pending.length && folders === previousFolders && !drafts.length) {
      this.storage.removeItem(this.key)
      return
    }
    const data: JournalData = {
      format: 1, documents: pending.map((document) => makePatch(document, baseline.get(document.id))),
      folders: folders === previousFolders ? undefined : folders, drafts,
    }
    // A compact synchronous write protects the asynchronous IndexedDB save
    // window. Unchanged subtrees are not serialized on every edit.
    this.storage.setItem(this.key, JSON.stringify(data))
  }
}

function rebuild(patch: DocumentPatch, existing?: MindMapDocument) {
  const nodes = new Map<string, NodeData | StoredNode>(existing ? nodeIndex(existing.root) : [])
  for (const node of patch.nodes) nodes.set(node.id, { ...node, children: node.children ?? nodes.get(node.id)?.children ?? [] } as NodeData | StoredNode)
  const visiting = new Set<string>()
  const used = new Set<string>()
  const build = (id: string): NodeData => {
    const node = nodes.get(id)
    if (!node || visiting.has(id) || used.has(id)) throw new Error('恢复记录中的节点结构不完整，原资料没有被覆盖。')
    visiting.add(id)
    used.add(id)
    const children = (node.children ?? []).map((child) => build(typeof child === 'string' ? child : child.id))
    visiting.delete(id)
    return { ...node, children }
  }
  return { ...patch.document, root: build(patch.rootId) }
}

// Pure recovery plan. Callers commit it atomically, then acknowledge its keys.
// Newer database data is kept; conflicting edits become a separate document.
export function planRecovery(storage: Storage, initialDocuments: MindMapDocument[], initialFolders: FolderData[]) {
  const documents = [...initialDocuments]
  let folders = initialFolders
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(JOURNAL_PREFIX)))
  let recovered = 0
  let conflicts = 0
  for (const key of keys) {
    const data = JSON.parse(storage.getItem(key) ?? 'null') as JournalData | null
    if (data?.format !== 1 || !Array.isArray(data.documents) || !Array.isArray(data.drafts)) throw new Error('发现无法解析的恢复记录。请先导出恢复记录，原知识库未被替换。')
    const targets = new Map<string, string>()
    for (const patch of data.documents) {
      const current = documents.find((document) => document.id === patch.document.id)
      if (current?.version === patch.document.version && current.updatedAt === patch.document.updatedAt) continue
      const conflict = Boolean(current && (current.version !== patch.baseVersion || current.updatedAt !== patch.baseUpdatedAt))
      const next = rebuild(patch, current)
      if (conflict) {
        const title = uniqueDocumentName(documents, `${next.title}（恢复副本）`)
        next.id = crypto.randomUUID()
        next.title = title
        next.linkAliases = undefined
        next.root = { ...next.root, title }
        conflicts++
      }
      targets.set(patch.document.id, next.id)
      const index = documents.findIndex((document) => document.id === next.id)
      if (index >= 0) documents[index] = next
      else documents.push(next)
      recovered++
    }
    for (const draft of data.drafts) {
      const target = targets.get(draft.documentId) ?? draft.documentId
      let index = documents.findIndex((document) => document.id === target)
      if (index < 0) {
        const root = createNode('恢复的未保存导图')
        documents.push({ id: crypto.randomUUID(), title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt })
        index = documents.length - 1
      }
      let current = documents[index]
      const patch = { ...draft.patch }
      for (const field of draft.clearFields ?? []) Object.assign(patch, { [field]: undefined })
      const existingNode = findNode(current.root, draft.nodeId)
      if (existingNode && Object.keys(patch).every((key) => JSON.stringify(existingNode[key as keyof NodeData]) === JSON.stringify(patch[key as keyof NodeData]))) continue
      if (!targets.has(draft.documentId) && current.version > draft.version) {
        const title = uniqueDocumentName(documents, `${current.title}（草稿恢复）`)
        current = { ...current, id: crypto.randomUUID(), title, linkAliases: undefined, root: { ...current.root, title } }
        documents.push(current)
        index = documents.length - 1
        targets.set(draft.documentId, current.id)
        conflicts++
      }
      const found = findNode(current.root, draft.nodeId)
      let root: NodeData
      if (found) root = mapNode(current.root, draft.nodeId, (node) => ({ ...node, ...patch, id: node.id, children: node.children }))
      else {
        const node = { ...createNode('恢复的未保存笔记'), ...patch, children: [] }
        root = { ...current.root, children: [...current.root.children, node] }
      }
      const title = uniqueDocumentName(documents, root.title.trim() || current.title, current.id)
      documents[index] = { ...current, title, root: { ...root, title },
        linkAliases: title === current.title ? current.linkAliases : [...new Set([...(current.linkAliases ?? []), current.title])],
        version: current.version + 1, updatedAt: new Date().toISOString() }
      recovered++
    }
    if (data.folders) {
      const merged = new Map(folders.map((folder) => [folder.id, folder]))
      for (const folder of data.folders) {
        const current = merged.get(folder.id)
        if (!current || folder.updatedAt >= current.updatedAt) merged.set(folder.id, folder)
      }
      folders = [...merged.values()]
    }
  }
  return { documents, folders, keys, recovered, conflicts }
}
