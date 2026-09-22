import type { FolderData, MindMapDocument } from '../../types/mindmap'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { usePaperStore } from '../../stores/paperStore'

let unsubscribe: (() => void) | undefined
let saveTimer: number | undefined
let lastDocuments: MindMapDocument[] | undefined
let lastFolders: FolderData[] | undefined
const lastSnapshotAt = new Map<string, number>()

export async function flushLocalPersistence() {
  if (saveTimer) {
    window.clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const latest = useDocumentStore.getState()
  await Promise.all([
    documentRepository.saveDocuments(latest.documents),
    documentRepository.saveFolders(latest.folders),
  ])
  await createIntervalSnapshots(latest.documents)
  useSaveStore.getState().markLocal()
}

export async function initializeLocalPersistence() {
  await documentRepository.initialize()
  const [documents, folders] = await Promise.all([
    documentRepository.loadDocuments(),
    documentRepository.loadFolders(),
    usePaperStore.getState().hydrate(),
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
      try {
        await flushLocalPersistence()
      } catch {
        useSaveStore.getState().setStatus('error')
      }
    }, 350)
  })
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
