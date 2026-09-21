import type { FolderData, MindMapDocument } from '../../types/mindmap'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { cloudSyncService } from '../supabase/cloudSyncService'

let unsubscribe: (() => void) | undefined
let saveTimer: number | undefined
let lastDocuments: MindMapDocument[] | undefined
let lastFolders: FolderData[] | undefined
const lastSnapshotAt = new Map<string, number>()

export async function initializeLocalPersistence() {
  await documentRepository.initialize()
  const [documents, folders] = await Promise.all([
    documentRepository.loadDocuments(),
    documentRepository.loadFolders(),
  ])
  useDocumentStore.getState().hydrate(documents, folders)
  lastDocuments = documents
  lastFolders = folders

  unsubscribe?.()
  unsubscribe = useDocumentStore.subscribe((state) => {
    if (!state.hydrated || (state.documents === lastDocuments && state.folders === lastFolders)) return
    lastDocuments = state.documents
    lastFolders = state.folders
    useSaveStore.getState().markSaving()
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(async () => {
      const latest = useDocumentStore.getState()
      try {
        await Promise.all([
          documentRepository.saveDocuments(latest.documents),
          documentRepository.saveFolders(latest.folders),
        ])
        useSaveStore.getState().markLocal()
        await createIntervalSnapshots(latest.documents)
        cloudSyncService.queue(latest.documents, latest.folders)
      } catch {
        useSaveStore.getState().setStatus('error')
      }
    }, 350)
  })

  cloudSyncService.startNetworkMonitoring()
}

async function createIntervalSnapshots(documents: MindMapDocument[]) {
  const now = Date.now()
  for (const document of documents) {
    if (document.deletedAt) continue
    const last = lastSnapshotAt.get(document.id) ?? 0
    if (now - last >= 120_000) {
      await documentRepository.createVersion(document, 'interval')
      lastSnapshotAt.set(document.id, now)
    }
  }
}
