import { appDatabase } from '../db/appDatabase'
import type { DocumentVersion, FolderData, MindMapDocument } from '../types/mindmap'

export const documentRepository = {
  async initialize() {
    const initialized = await appDatabase.meta.get('initialized')
    if (!initialized) {
      // Fresh installations start empty. Existing records are never seeded or cleared.
      await appDatabase.meta.put({ key: 'initialized', value: new Date().toISOString() })
    }
  },

  loadDocuments: () => appDatabase.documents.toArray(),
  loadFolders: () => appDatabase.folders.toArray(),
  saveDocuments: async (documents: MindMapDocument[]) => appDatabase.transaction('rw', appDatabase.documents,
    () => appDatabase.documents.bulkPut(structuredClone(documents))),
  saveDocument: (document: MindMapDocument) => appDatabase.documents.put(structuredClone(document)),
  saveFolders: (folders: FolderData[]) => appDatabase.folders.bulkPut(structuredClone(folders)),
  async permanentlyDeleteDocument(id: string) {
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
      arrows: structuredClone(document.arrows ?? []), summaries: structuredClone(document.summaries ?? []),
      createdAt: new Date().toISOString(), reason,
    }
    await appDatabase.versions.add(version)
    const versions = await appDatabase.versions.where('documentId').equals(document.id).sortBy('createdAt')
    if (versions.length > 50) await appDatabase.versions.bulkDelete(versions.slice(0, versions.length - 50).map((item) => item.id))
    return version
  },

  listVersions: (documentId: string) => appDatabase.versions.where('documentId').equals(documentId).reverse().sortBy('createdAt'),
}
