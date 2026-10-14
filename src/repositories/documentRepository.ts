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
  saveWorkspace: async (documents: MindMapDocument[], folders?: FolderData[], expected?: { documents: Map<string, MindMapDocument>; folders?: FolderData[] }) => appDatabase.transaction('rw', [appDatabase.documents, appDatabase.folders], async () => {
    if (expected) {
      for (const document of documents) {
        const current = await appDatabase.documents.get(document.id)
        const baseline = expected.documents.get(document.id)
        if (current?.version === baseline?.version && current?.updatedAt === baseline?.updatedAt && JSON.stringify(current) === JSON.stringify(baseline)) continue
        // PDF/annotation transactions can have already committed this exact tree.
        if (current && JSON.stringify(current) === JSON.stringify(document)) continue
        throw new Error('检测到其他窗口更新了资料，已停止覆盖。请导出当前编辑，关闭其他窗口后重新打开。')
      }
      if (folders && expected.folders) {
        const current = (await appDatabase.folders.toArray()).sort((left, right) => left.id.localeCompare(right.id))
        const canonical = (values: FolderData[]) => JSON.stringify([...values].sort((left, right) => left.id.localeCompare(right.id)))
        if (JSON.stringify(current) !== canonical(expected.folders) && JSON.stringify(current) !== canonical(folders)) throw new Error('文件夹已在其他窗口变化，已停止覆盖，请先导出当前资料。')
      }
    }
    if (documents.length) await appDatabase.documents.bulkPut(structuredClone(documents))
    if (folders) await appDatabase.folders.bulkPut(structuredClone(folders))
  }),
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
    await appDatabase.transaction('rw', appDatabase.versions, async () => {
      const versions = await appDatabase.versions.where('documentId').equals(document.id).sortBy('createdAt')
      if (versions.length >= 50) await appDatabase.versions.bulkDelete(versions.slice(0, versions.length - 49).map((item) => item.id))
      await appDatabase.versions.add(version)
    })
    return version
  },

  listVersions: (documentId: string) => appDatabase.versions.where('documentId').equals(documentId).reverse().sortBy('createdAt'),
}
