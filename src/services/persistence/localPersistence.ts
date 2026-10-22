import type { FolderData, MindMapDocument } from '../../types/mindmap'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { loadPaperData, usePaperStore } from '../../stores/paperStore'
import { liveQuery } from 'dexie'
import { useDataSafetyStore } from '../../stores/dataSafetyStore'
import { JOURNAL_PREFIX, planRecovery, RecoveryJournal, type EditorDraft } from './recoveryJournal'
import { draftKey, isDraftCommitted, readEditorDraft } from './editorDraft'
import { useSelectionStore } from '../../stores/selectionStore'
import { findNode } from '../../utils/tree'
import { joinWorkspace, liveJournalKeys, protectLiveJournal, withWorkspaceTransaction } from './windowCoordination'

let unsubscribe: (() => void) | undefined
let saveTimer: number | undefined
let retryTimer: number | undefined
let retryCount = 0
const lastSnapshotAt = new Map<string, number>()
let flushQueue: Promise<void> = Promise.resolve()
let persistedDocuments = new Map<string, MindMapDocument>()
let persistedFolders: FolderData[] | undefined
let journal: RecoveryJournal | undefined
const drafts = new Map<string, EditorDraft>()
let committingDrafts = false
let suspended = false
let installed = false
let applyingRemote = false
let editingRequest: symbol | undefined
let observing = false

function writeJournal() {
  for (const [key, draft] of drafts) if (isDraftCommitted(draft)) drafts.delete(key)
  if (!journal || suspended) return
  try {
    const latest = useDocumentStore.getState()
    journal.write(latest.documents, latest.folders, persistedDocuments, persistedFolders, [...drafts.values()])
    useDataSafetyStore.setState({ journalError: undefined })
  } catch {
    useDataSafetyStore.setState({ journalError: '草稿暂存失败。请保持此窗口打开，并尽快导出完整备份。' })
  }
}

function needsSave() {
  const state = useDocumentStore.getState()
  return Boolean(drafts.size || state.folders !== persistedFolders || state.documents.some((document) => persistedDocuments.get(document.id) !== document))
}

function commitEditorDrafts() {
  if (suspended || committingDrafts) return
  committingDrafts = true
  try {
    for (const draft of [...drafts.values()]) {
      if (isDraftCommitted(draft)) continue
      const document = useDocumentStore.getState().documents.find((item) => item.id === draft.documentId && !item.deletedAt)
      if (!document || !findNode(document.root, draft.nodeId)) continue // Retain orphaned edits in the journal for recovery.
      const patch = { ...draft.patch }
      for (const field of draft.clearFields ?? []) Object.assign(patch, { [field]: undefined })
      useDocumentStore.getState().updateDocumentNode(document.id, draft.nodeId, patch)
    }
  } finally { committingDrafts = false }
  writeJournal()
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
    if (changedDocuments.length || folders) await withWorkspaceTransaction(() => documentRepository.saveWorkspace(changedDocuments, folders, { documents: persistedDocuments, folders: persistedFolders }))
    for (const document of changedDocuments) persistedDocuments.set(document.id, document)
    if (folders) persistedFolders = folders
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
  commitEditorDrafts()
  await flushLocalPersistence()
  await synchronizeLocalWorkspace()
  if (drafts.size) {
    useSaveStore.getState().setStatus('error')
    throw new Error('仍有未能提交的草稿。请先导出恢复记录，当前页面不会自动关闭或替换资料。')
  }
}

// Adopt saved changes only for clean documents. Local edits and uncommitted
// drafts retain their baseline, so the repository can reject stale writes.
async function readRemoteWorkspace() {
  if (suspended || !useDocumentStore.getState().hydrated) return
  const [remoteDocuments, remoteFolders] = await Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders()])
  const state = useDocumentStore.getState()
  const local = new Map(state.documents.map((document) => [document.id, document]))
  const protectedIds = new Set([...drafts.values()].filter((draft) => !isDraftCommitted(draft)).map((draft) => draft.documentId))
  const histories = { ...state.histories }
  let changed = false
  const documents = remoteDocuments.map((remote) => {
    const current = local.get(remote.id)
    local.delete(remote.id)
    const baseline = persistedDocuments.get(remote.id)
    if (current && (current !== baseline || protectedIds.has(remote.id))) return current
    if (current && JSON.stringify(current) === JSON.stringify(remote)) return current
    changed = true
    persistedDocuments.set(remote.id, remote)
    delete histories[remote.id]
    return remote
  })
  for (const current of local.values()) {
    if (current !== persistedDocuments.get(current.id) || protectedIds.has(current.id)) documents.push(current)
    else {
      changed = true
      persistedDocuments.delete(current.id)
      delete histories[current.id]
    }
  }
  let folders = state.folders
  const canonicalFolders = (values: FolderData[]) => JSON.stringify([...values].sort((a, b) => a.id.localeCompare(b.id)))
  if (folders === persistedFolders && canonicalFolders(folders) !== canonicalFolders(remoteFolders)) {
    folders = remoteFolders
    persistedFolders = folders
    changed = true
  }
  if (!changed) return
  applyingRemote = true
  try { useDocumentStore.setState({ documents, folders, histories }) }
  finally { applyingRemote = false }
  writeJournal()
}

async function recoverAbandonedJournals(documents: MindMapDocument[], folders: FolderData[]) {
  const storage = window.localStorage
  const recovery = planRecovery(storage, documents, folders, await liveJournalKeys())
  if (recovery.keys.length) {
    await documentRepository.saveWorkspace(recovery.documents, recovery.folders, { documents: new Map(documents.map((document) => [document.id, document])), folders })
    for (const key of recovery.keys) storage.removeItem(key)
    if (recovery.recovered) useDataSafetyStore.setState({ recoveryNotice: recovery.conflicts ? '已恢复未保存内容；有版本冲突的导图保留为独立恢复副本。' : '已自动恢复上次未保存的编辑内容。' })
  }
  return { documents: recovery.documents, folders: recovery.folders }
}

export function synchronizeLocalWorkspace(recover = false) {
  // Read when the queued task runs, rather than retaining an older live-query
  // snapshot that could otherwise replace a save completed in the meantime.
  const pending = flushQueue.catch(() => undefined).then(() => withWorkspaceTransaction(async () => {
    if (recover && journal && !suspended) {
      const [documents, folders] = await Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders()])
      await recoverAbandonedJournals(documents, folders)
    }
    await readRemoteWorkspace()
  }))
  flushQueue = pending
  return pending
}

function observeOtherWindows() {
  if (observing) return
  observing = true
  liveQuery(() => Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders()])).subscribe({
    next: () => { void synchronizeLocalWorkspace().catch(() => useDataSafetyStore.setState({ journalError: '其他窗口的资料暂时无法同步，请保持当前窗口打开并重试。' })) },
    error: () => useDataSafetyStore.setState({ journalError: '其他窗口的资料暂时无法同步，请保持当前窗口打开并重新读取。' }),
  })
  liveQuery(loadPaperData).subscribe({
    next: (data) => usePaperStore.setState({ ...data, hydrated: true }),
    error: () => useDataSafetyStore.setState({ recoveryNotice: '其他窗口的论文与批注暂时无法同步，请重新打开阅读视图。' }),
  })
}

// Each window has its own document store and selection. Only editing the same
// document needs a long-lived exclusive lock; other maps remain editable.
export function watchDocumentEditing(documentId: string) {
  const token = Symbol(documentId)
  editingRequest = token
  let cancelled = false
  let release: (() => void) | undefined
  const abort = new AbortController()
  useDataSafetyStore.setState({ editingDocumentId: undefined, waitingDocumentId: documentId })
  const acquired = async () => {
    await synchronizeLocalWorkspace(true)
    if (cancelled) return
    useDataSafetyStore.setState({ editingDocumentId: documentId, waitingDocumentId: undefined })
    await new Promise<void>((resolve) => { release = resolve })
  }
  if (navigator.locks) {
    void navigator.locks.request(`researchmind-document-editor-v2:${documentId}`, { signal: abort.signal }, acquired)
      .catch((error: unknown) => {
        if (!cancelled) useDataSafetyStore.setState({ journalError: error instanceof Error ? error.message : '无法获取这份导图的编辑权限。' })
      })
  } else void acquired()
  return () => {
    cancelled = true
    abort.abort()
    if (editingRequest === token) useDataSafetyStore.setState({ editingDocumentId: undefined, waitingDocumentId: undefined })
    // Flush and preserve recovery records before another window can edit.
    void prepareForNavigation().catch(() => undefined).finally(() => release?.())
  }
}

function subscribeToChanges() {
  unsubscribe?.()
  unsubscribe = useDocumentStore.subscribe((state, previous) => {
    if (state.activeDocumentId !== previous.activeDocumentId) commitEditorDrafts()
    if (suspended || applyingRemote || !state.hydrated || (state.documents === previous.documents && state.folders === previous.folders)) return
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
  document.addEventListener('researchmind:draft-settled', (event) => {
    const current = readEditorDraft(event.target)
    if (current) drafts.delete(draftKey(current))
    writeJournal()
    if (!needsSave()) useSaveStore.getState().markLocal()
  })
  document.addEventListener('input', (event) => {
    const next = readEditorDraft(event.target)
    if (!next || suspended) return
    drafts.set(draftKey(next), next)
    writeJournal()
    if (useSaveStore.getState().status !== 'error') useSaveStore.getState().markSaving()
  }) // After React's delegated onChange, so controlled inputs keep their value.
  document.addEventListener('blur', (event) => {
    const current = readEditorDraft(event.target)
    if (!current) return
    if (event.target instanceof HTMLElement && event.target.dataset.draftCancelled === 'true') {
      drafts.delete(draftKey(current))
      delete event.target.dataset.draftCancelled
    }
    queueMicrotask(() => {
      writeJournal()
      if (!needsSave()) useSaveStore.getState().markLocal()
    })
  }, true)
  useSelectionStore.subscribe((state, previous) => {
    if (state.selectedNodeId !== previous.selectedNodeId) commitEditorDrafts()
  })
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
    void synchronizeLocalWorkspace().catch(() => undefined)
  })
  document.addEventListener('pointerdown', () => {
    if (navigator.storage?.persist) void navigator.storage.persist().then((persistentStorage) => useDataSafetyStore.setState({ persistentStorage })).catch(() => undefined)
  }, { once: true })
}

export async function initializeLocalPersistence() {
  useDataSafetyStore.setState({ waitingForWriter: true })
  await joinWorkspace()
  useDataSafetyStore.setState({ waitingForWriter: false })
  await withWorkspaceTransaction(async () => {
    await documentRepository.initialize()
    let [documents, folders] = await Promise.all([documentRepository.loadDocuments(), documentRepository.loadFolders()])
    const sessionKey = JOURNAL_PREFIX + crypto.randomUUID()
    await protectLiveJournal(sessionKey)
    try {
      const storage = window.localStorage
      const recovery = await recoverAbandonedJournals(documents, folders)
      documents = recovery.documents
      folders = recovery.folders
      journal = new RecoveryJournal(storage, sessionKey)
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
  })
  observeOtherWindows()
}

export async function replaceLocalKnowledgeBase<T>(operation: () => Promise<T>, preserveWorkspace = false) {
  await prepareForNavigation()
  return withWorkspaceTransaction(async () => {
    if (!preserveWorkspace && (await liveJournalKeys()).size > 1) throw new Error('恢复整个知识库前，请先关闭其他枝间窗口，再在此窗口恢复，以保留各窗口尚未保存的内容。')
    const previousWorkspace = useDocumentStore.getState()
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
      drafts.clear()
      useDocumentStore.setState({ documents, folders, histories: preserveWorkspace ? previousWorkspace.histories : {}, activeDocumentId: preserveWorkspace ? previousWorkspace.activeDocumentId : undefined })
      hydrated = true
      return result
    } finally {
      if (committed && !hydrated) {
        useDocumentStore.setState({ hydrated: false })
        useDataSafetyStore.setState({ startupError: '资料已写入，但重新读取失败。请重新打开应用；为保护写入结果，已停止保存旧状态。' })
      } else {
        suspended = false
        writeJournal()
        subscribeToChanges()
      }
    }
  })
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
