import type { FolderData, MindMapDocument } from '../../types/mindmap'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { usePaperStore } from '../../stores/paperStore'
import { useDataSafetyStore } from '../../stores/dataSafetyStore'
import { planRecovery, RecoveryJournal, type EditorDraft } from './recoveryJournal'
import { readEditorDraft } from './editorDraft'

let unsubscribe: (() => void) | undefined
let saveTimer: number | undefined
let retryTimer: number | undefined
let retryCount = 0
const lastSnapshotAt = new Map<string, number>()
let flushQueue: Promise<void> = Promise.resolve()
let persistedDocuments = new Map<string, MindMapDocument>()
let persistedFolders: FolderData[] | undefined
let journal: RecoveryJournal | undefined
let draft: EditorDraft | undefined
let suspended = false
let installed = false
let writer: Promise<void> | undefined

function writeJournal() {
  if (!journal || suspended) return
  try {
    const latest = useDocumentStore.getState()
    journal.write(latest.documents, latest.folders, persistedDocuments, persistedFolders, draft ? [draft] : [])
    useDataSafetyStore.setState({ journalError: undefined })
  } catch {
    useDataSafetyStore.setState({ journalError: '草稿暂存失败。请保持此窗口打开，并尽快导出完整备份。' })
  }
}

function needsSave() {
  const state = useDocumentStore.getState()
  return Boolean(draft || state.folders !== persistedFolders || state.documents.some((document) => persistedDocuments.get(document.id) !== document))
}

function scheduleRetry() {
  if (typeof window === 'undefined' || retryTimer || suspended) return
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined
    void flushLocalPersistence().catch(() => undefined)
  }, Math.min(30_000, 1000 * 2 ** Math.min(retryCount++, 5)))
}

export function flushLocalPersistence() {
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = undefined }
  if (suspended) return Promise.resolve()
  writeJournal()
  const pending = flushQueue.catch(() => undefined).then(async () => {
    if (suspended) return
    const latest = useDocumentStore.getState()
    const changedDocuments = latest.documents.filter((document) => persistedDocuments.get(document.id) !== document)
    const folders = latest.folders !== persistedFolders ? latest.folders : undefined
    if (changedDocuments.length || folders) await documentRepository.saveWorkspace(changedDocuments, folders, { documents: persistedDocuments, folders: persistedFolders })
    persistedDocuments = new Map(latest.documents.map((document) => [document.id, document]))
    persistedFolders = latest.folders
    retryCount = 0
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = undefined }
    writeJournal()
    if (!needsSave()) useSaveStore.getState().markLocal()
    try { await createIntervalSnapshots(changedDocuments) }
    catch { useDataSafetyStore.setState({ recoveryNotice: '正文已保存，但历史快照写入失败。请检查设备空间并导出完整备份。' }) }
  }).catch((error: unknown) => {
    useSaveStore.getState().setStatus('error')
    scheduleRetry()
    throw error
  })
  flushQueue = pending
  return pending
}

export async function prepareForNavigation() {
  if (!useDocumentStore.getState().hydrated || suspended) return
  if (globalThis.document.activeElement instanceof HTMLElement) globalThis.document.activeElement.blur()
  await Promise.resolve()
  await flushLocalPersistence()
}

function acquireWriter() {
  if (writer) return writer
  if (!navigator.locks) return Promise.resolve()
  useDataSafetyStore.setState({ waitingForWriter: true })
  writer = new Promise<void>((resolve, reject) => {
    void navigator.locks.request('researchmind-knowledge-writer-v1', async () => {
      useDataSafetyStore.setState({ waitingForWriter: false })
      resolve()
      await new Promise<void>(() => {})
    }).catch((error: unknown) => { useDataSafetyStore.setState({ waitingForWriter: false }); reject(error) })
  })
  return writer
}

function subscribeToChanges() {
  unsubscribe?.()
  unsubscribe = useDocumentStore.subscribe((state, previous) => {
    if (suspended || !state.hydrated || (state.documents === previous.documents && state.folders === previous.folders)) return
    writeJournal()
    if (useSaveStore.getState().status !== 'error') useSaveStore.getState().markSaving()
    if (saveTimer) window.clearTimeout(saveTimer)
    if (state.folders !== previous.folders) void flushLocalPersistence().catch(() => undefined)
    else saveTimer = window.setTimeout(() => { void flushLocalPersistence().catch(() => undefined) }, 350)
  })
}

function installLifecycleProtection() {
  if (installed) return
  installed = true
  document.addEventListener('input', (event) => {
    const next = readEditorDraft(event.target)
    if (!next || suspended) return
    draft = next
    writeJournal()
    if (useSaveStore.getState().status !== 'error') useSaveStore.getState().markSaving()
  }) // After React's delegated onChange, so controlled inputs keep their value.
  document.addEventListener('blur', (event) => {
    if (!readEditorDraft(event.target)) return
    const previous = draft
    queueMicrotask(() => {
      if (draft === previous && !useDocumentStore.getState().nameError) draft = undefined
      writeJournal()
      if (!needsSave()) useSaveStore.getState().markLocal()
    })
  }, true)
  const leaving = () => { void prepareForNavigation().catch(() => undefined) }
  window.addEventListener('pagehide', leaving)
  window.addEventListener('researchmind:pause', leaving)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving()
  })
  window.addEventListener('beforeunload', (event) => {
    writeJournal()
    if (!suspended && needsSave() && useDataSafetyStore.getState().journalError) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  window.addEventListener('focus', () => {
    if (useSaveStore.getState().status === 'error') void flushLocalPersistence().catch(() => undefined)
  })
  document.addEventListener('pointerdown', () => {
    if (navigator.storage?.persist) void navigator.storage.persist().then((persistentStorage) => useDataSafetyStore.setState({ persistentStorage })).catch(() => undefined)
  }, { once: true })
}

export async function initializeLocalPersistence() {
  await acquireWriter()
  await documentRepository.initialize()
  let [documents, folders] = await Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders()])
  try {
    const storage = window.localStorage
    const recovery = planRecovery(storage, documents, folders)
    if (recovery.keys.length) {
      await documentRepository.saveWorkspace(recovery.documents, recovery.folders, { documents: new Map(documents.map((document) => [document.id, document])), folders })
      for (const key of recovery.keys) storage.removeItem(key)
      documents = recovery.documents
      folders = recovery.folders
      if (recovery.recovered) useDataSafetyStore.setState({ recoveryNotice: recovery.conflicts ? '已恢复未保存内容；有版本冲突的导图保留为独立恢复副本。' : '已自动恢复上次未保存的编辑内容。' })
    }
    journal = new RecoveryJournal(storage)
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'SecurityError') throw error
    useDataSafetyStore.setState({ journalError: '此浏览器禁止草稿暂存。请保持窗口打开，编辑后及时创建完整备份。' })
  }
  await usePaperStore.getState().hydrate()
  persistedDocuments = new Map(documents.map((document) => [document.id, document]))
  persistedFolders = folders
  useDocumentStore.setState({ documents, folders, hydrated: true, histories: {} })
  useDataSafetyStore.setState({ startupError: undefined })
  subscribeToChanges()
  installLifecycleProtection()
}

export async function replaceLocalKnowledgeBase<T>(operation: () => Promise<T>) {
  await prepareForNavigation()
  suspended = true
  unsubscribe?.()
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = undefined }
  let committed = false
  let hydrated = false
  try {
    const result = await operation()
    committed = true
    const [documents, folders] = await Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders(), usePaperStore.getState().hydrate()])
    persistedDocuments = new Map(documents.map((document) => [document.id, document]))
    persistedFolders = folders
    draft = undefined
    useDocumentStore.setState({ documents, folders, histories: {}, activeDocumentId: undefined })
    hydrated = true
    return result
  } finally {
    if (committed && !hydrated) {
      useDocumentStore.setState({ hydrated: false })
      useDataSafetyStore.setState({ startupError: '备份已写入，但重新读取失败。请重新打开应用；为保护恢复结果，已停止写入旧资料。' })
    } else {
      suspended = false
      writeJournal()
      subscribeToChanges()
    }
  }
}

async function createIntervalSnapshots(documents: MindMapDocument[]) {
  const now = Date.now()
  for (const document of documents) {
    if (document.deletedAt) continue
    if (now - (lastSnapshotAt.get(document.id) ?? 0) >= 120_000) {
      await documentRepository.createVersion(document, 'interval')
      lastSnapshotAt.set(document.id, now)
    }
  }
}
