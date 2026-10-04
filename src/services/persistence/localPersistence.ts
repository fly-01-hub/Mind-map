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
let flushQueue: Promise<void> = Promise.resolve()

export function flushLocalPersistence() {
  if (saveTimer) {
    window.clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const pending = flushQueue.catch(() => undefined).then(async () => {
    const latest = useDocumentStore.getState()
    await Promise.all([
      documentRepository.saveDocuments(latest.documents),
      documentRepository.saveFolders(latest.folders),
    ])
    await createIntervalSnapshots(latest.documents)
    // A newer edit queued during this save still needs to show as unsaved.
    if (useDocumentStore.getState().documents === latest.documents && useDocumentStore.getState().folders === latest.folders) useSaveStore.getState().markLocal()
  })
  flushQueue = pending
  return pending
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
    const foldersChanged = state.folders !== lastFolders
    lastDocuments = state.documents
    lastFolders = state.folders
    useSaveStore.getState().markSaving()
    if (saveTimer) window.clearTimeout(saveTimer)
    // Folder operations are infrequent and users commonly navigate or refresh right
    // after creating one. Persist them immediately instead of risking the debounce
    // window dropping the change during navigation.
    if (foldersChanged) {
      void flushLocalPersistence().catch(() => useSaveStore.getState().setStatus('error'))
      return
    }
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
