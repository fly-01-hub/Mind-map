import { appDatabase } from '../db/appDatabase'
import { mockDocuments } from '../data/mockDocuments'
import type { DocumentVersion, FolderData, MindMapDocument } from '../types/mindmap'
import { supabase } from '../services/supabase/client'

const initialFolders: FolderData[] = [
  { id: 'research', name: '科研资料', order: 0, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' },
  { id: 'writing', name: '创作计划', order: 1, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' },
]
const cloudIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const documentRepository = {
  async initialize() {
    const initialized = await appDatabase.meta.get('initialized')
    if (!initialized) {
      if (await appDatabase.documents.count() === 0) await appDatabase.documents.bulkPut(structuredClone(mockDocuments))
      if (await appDatabase.folders.count() === 0) await appDatabase.folders.bulkPut(initialFolders)
      await appDatabase.meta.put({ key: 'initialized', value: new Date().toISOString() })
    }
  },

  loadDocuments: () => appDatabase.documents.toArray(),
  loadFolders: () => appDatabase.folders.toArray(),
  saveDocuments: (documents: MindMapDocument[]) => appDatabase.documents.bulkPut(structuredClone(documents)),
  saveDocument: (document: MindMapDocument) => appDatabase.documents.put(structuredClone(document)),
  saveFolders: (folders: FolderData[]) => appDatabase.folders.bulkPut(structuredClone(folders)),
  async permanentlyDeleteDocument(id: string) {
    if (supabase && cloudIdPattern.test(id)) {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        if (!navigator.onLine) throw new Error('需要联网后才能永久删除已同步文档。')
        const { data: attachments, error: listError } = await supabase.from('attachments').select('storage_path').eq('document_id', id)
        if (listError) throw listError
        const paths = (attachments ?? []).map((item) => item.storage_path as string)
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from('attachments').remove(paths)
          if (storageError) throw storageError
        }
        const { error: deleteError } = await supabase.from('documents').delete().eq('id', id)
        if (deleteError) throw deleteError
      }
    }
    await appDatabase.transaction('rw', [appDatabase.documents, appDatabase.versions, appDatabase.attachmentBlobs, appDatabase.nodePaperRelations, appDatabase.annotationNodeRelations], async () => {
      await appDatabase.documents.delete(id)
      await appDatabase.versions.where('documentId').equals(id).delete()
      await appDatabase.attachmentBlobs.where('documentId').equals(id).delete()
      await appDatabase.nodePaperRelations.where('documentId').equals(id).delete()
      await appDatabase.annotationNodeRelations.where('documentId').equals(id).delete()
    })
  },

  async createVersion(document: MindMapDocument, reason: DocumentVersion['reason']) {
    const version: DocumentVersion = {
      id: crypto.randomUUID(), documentId: document.id, version: document.version,
      title: document.title, root: structuredClone(document.root),
      createdAt: new Date().toISOString(), reason,
    }
    await appDatabase.versions.add(version)
    const versions = await appDatabase.versions.where('documentId').equals(document.id).sortBy('createdAt')
    if (versions.length > 50) await appDatabase.versions.bulkDelete(versions.slice(0, versions.length - 50).map((item) => item.id))
    return version
  },

  listVersions: (documentId: string) => appDatabase.versions.where('documentId').equals(documentId).reverse().sortBy('createdAt'),
}
