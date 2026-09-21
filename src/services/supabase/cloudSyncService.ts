import type { FolderData, MindMapDocument, NodeData } from '../../types/mindmap'
import { documentRepository } from '../../repositories/documentRepository'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { supabase } from './client'
import { paperSyncService } from './paperSyncService'

interface CloudDocumentRow {
  id: string
  title: string
  content: NodeData
  version: number
  folder_id: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface CloudFolderRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

let syncTimer: number | undefined
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isCloudId = (id: string | undefined): id is string => Boolean(id && uuidPattern.test(id))

function fromCloudDocument(remote: CloudDocumentRow): MindMapDocument {
  return {
    id: remote.id, title: remote.title, root: remote.content, version: remote.version,
    folderId: remote.folder_id ?? undefined, isFavorite: remote.is_favorite,
    createdAt: remote.created_at, updatedAt: remote.updated_at, deletedAt: remote.deleted_at ?? undefined,
  }
}

function fromCloudFolder(remote: CloudFolderRow): FolderData {
  return {
    id: remote.id, name: remote.name, parentId: remote.parent_id ?? undefined,
    order: remote.sort_order, createdAt: remote.created_at, updatedAt: remote.updated_at,
    deletedAt: remote.deleted_at ?? undefined,
  }
}

function hasDiverged(document: MindMapDocument, remote: CloudDocumentRow) {
  if (document.version !== remote.version || document.updatedAt === remote.updated_at) return false
  return document.title !== remote.title
    || document.folderId !== (remote.folder_id ?? undefined)
    || document.isFavorite !== remote.is_favorite
    || JSON.stringify(document.root) !== JSON.stringify(remote.content)
}

function makeConflictCopy(document: MindMapDocument): MindMapDocument {
  const timestamp = new Date().toISOString()
  return {
    ...structuredClone(document), id: crypto.randomUUID(),
    title: `${document.title} - 冲突恢复 - ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
    version: 1, createdAt: timestamp, updatedAt: timestamp,
  }
}

async function recoverConflict(document: MindMapDocument, remote: CloudDocumentRow) {
  const conflict = makeConflictCopy(document)
  await documentRepository.createVersion(document, 'conflict')
  useDocumentStore.setState((state) => ({
    documents: [conflict, ...state.documents.map((item) => item.id === remote.id ? fromCloudDocument(remote) : item)],
  }))
}

async function syncOne(document: MindMapDocument, userId: string) {
  if (!supabase || !isCloudId(document.id)) return
  const { data, error } = await supabase.from('documents').select('id,title,content,version,folder_id,is_favorite,created_at,updated_at,deleted_at').eq('id', document.id).maybeSingle()
  if (error) throw error
  const remote = data as CloudDocumentRow | null
  if (remote && (remote.version > document.version || hasDiverged(document, remote))) {
    await recoverConflict(document, remote)
    return
  }
  const { error: upsertError } = await supabase.from('documents').upsert({
    id: document.id, user_id: userId, folder_id: isCloudId(document.folderId) ? document.folderId : null,
    title: document.title, content: document.root, markdown_cache: null,
    version: document.version, is_favorite: document.isFavorite,
    created_at: document.createdAt, updated_at: document.updatedAt,
    deleted_at: document.deletedAt ?? null,
  })
  if (upsertError) throw upsertError
}

async function syncFolders(folders: FolderData[], userId: string) {
  if (!supabase) return
  const rows = folders.filter((folder) => isCloudId(folder.id)).map((folder) => ({
    id: folder.id, user_id: userId, parent_id: isCloudId(folder.parentId) ? folder.parentId : null,
    name: folder.name, sort_order: folder.order, created_at: folder.createdAt,
    updated_at: folder.updatedAt, deleted_at: folder.deletedAt ?? null,
  }))
  if (!rows.length) return
  const { error } = await supabase.from('folders').upsert(rows)
  if (error) throw error
}

async function syncPendingAttachments(document: MindMapDocument, userId: string): Promise<MindMapDocument> {
  if (!isCloudId(document.id)) return document
  let changed = false
  const visit = async (node: NodeData): Promise<NodeData> => {
    const attachments = []
    for (const attachment of node.attachments) {
      const uploaded = await attachmentRepository.uploadPending(attachment, document.id, node.id, userId)
      if (uploaded.storagePath !== attachment.storagePath) changed = true
      attachments.push(uploaded)
    }
    const children = await Promise.all(node.children.map(visit))
    return { ...node, attachments, children }
  }
  const root = await visit(document.root)
  if (!changed) return document
  const updated: MindMapDocument = {
    ...document, root, version: document.version + 1, updatedAt: new Date().toISOString(),
  }
  useDocumentStore.setState((state) => ({
    documents: state.documents.map((item) => item.id === updated.id ? updated : item),
  }))
  await documentRepository.saveDocument(updated)
  return updated
}

async function syncVersions(documents: MindMapDocument[], userId: string) {
  if (!supabase) return
  for (const document of documents.filter((item) => isCloudId(item.id))) {
    const versions = await documentRepository.listVersions(document.id)
    if (!versions.length) continue
    const { error } = await supabase.from('document_versions').upsert(versions.map((version) => ({
      id: version.id, user_id: userId, document_id: version.documentId,
      version: version.version, title: version.title, content: version.root,
      reason: version.reason, created_at: version.createdAt,
    })))
    if (error) throw error
  }
}

export const cloudSyncService = {
  queue(documents: MindMapDocument[], folders: FolderData[]) {
    if (!supabase) return
    if (syncTimer) window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => { void this.sync(documents, folders) }, 1100)
  },

  async pull() {
    if (!supabase || !navigator.onLine) return
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return
    const [{ data: documentRows, error: documentError }, { data: folderRows, error: folderError }] = await Promise.all([
      supabase.from('documents').select('id,title,content,version,folder_id,is_favorite,created_at,updated_at,deleted_at'),
      supabase.from('folders').select('id,name,parent_id,sort_order,created_at,updated_at,deleted_at'),
    ])
    if (documentError) throw documentError
    if (folderError) throw folderError

    const remoteDocuments = (documentRows ?? []) as CloudDocumentRow[]
    const remoteFolders = (folderRows ?? []) as CloudFolderRow[]
    const state = useDocumentStore.getState()
    const documents = [...state.documents]
    for (const remote of remoteDocuments) {
      const index = documents.findIndex((document) => document.id === remote.id)
      if (index < 0) documents.push(fromCloudDocument(remote))
      else if (remote.version > documents[index].version) documents[index] = fromCloudDocument(remote)
      else if (hasDiverged(documents[index], remote)) {
        await documentRepository.createVersion(documents[index], 'conflict')
        documents.unshift(makeConflictCopy(documents[index]))
        const shiftedIndex = documents.findIndex((document) => document.id === remote.id)
        documents[shiftedIndex] = fromCloudDocument(remote)
      }
    }
    const folders = [...state.folders]
    for (const remote of remoteFolders) {
      const index = folders.findIndex((folder) => folder.id === remote.id)
      if (index < 0) folders.push(fromCloudFolder(remote))
      else if (remote.updated_at > folders[index].updatedAt) folders[index] = fromCloudFolder(remote)
    }
    useDocumentStore.setState({ documents, folders })
    await paperSyncService.pull(sessionData.session.user.id)
  },

  async sync(documents: MindMapDocument[], folders: FolderData[]) {
    if (!supabase) return
    if (!navigator.onLine) { useSaveStore.getState().setStatus('offline'); return }
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return
    useSaveStore.getState().setStatus('syncing')
    try {
      await syncFolders(folders, userId)
      const syncedDocuments: MindMapDocument[] = []
      for (const document of documents) {
        await syncOne(document, userId)
        const ready = await syncPendingAttachments(document, userId)
        syncedDocuments.push(ready)
        if (ready !== document) await syncOne(ready, userId)
      }
      await syncVersions(syncedDocuments, userId)
      await paperSyncService.syncPending(userId)
      useSaveStore.getState().setStatus('synced')
    } catch {
      useSaveStore.getState().setStatus('error')
    }
  },

  startNetworkMonitoring() {
    window.addEventListener('offline', () => useSaveStore.getState().setStatus('offline'))
    window.addEventListener('online', () => {
      useSaveStore.getState().markLocal()
      void this.pull().finally(() => {
        const state = useDocumentStore.getState()
        this.queue(state.documents, state.folders)
      })
    })
    if (!navigator.onLine) useSaveStore.getState().setStatus('offline')
  },
}
