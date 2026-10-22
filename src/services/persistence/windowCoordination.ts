// Keep old releases' exclusive workspace lock compatible with new releases.
// New windows share that compatibility lock, then serialize only transactions.
const SESSION_PREFIX = 'researchmind-live-journal-v2:'
let compatibility: Promise<void> | undefined

export function joinWorkspace() {
  if (!navigator.locks) return Promise.resolve()
  compatibility ??= new Promise<void>((resolve, reject) => {
    void navigator.locks.request('researchmind-knowledge-writer-v1', { mode: 'shared' }, async () => {
      resolve()
      await new Promise<void>(() => {})
    }).catch(reject)
  })
  return compatibility
}

export function withWorkspaceTransaction<T>(operation: () => Promise<T>): Promise<T> {
  return navigator.locks
    ? navigator.locks.request('researchmind-workspace-transaction-v2', operation)
    : operation()
}

export function protectLiveJournal(key: string) {
  if (!navigator.locks) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    void navigator.locks.request(SESSION_PREFIX + key, async () => {
      resolve()
      await new Promise<void>(() => {})
    }).catch(reject)
  })
}

export async function liveJournalKeys() {
  const locks = await navigator.locks?.query()
  return new Set((locks?.held ?? []).flatMap((lock) => lock.name?.startsWith(SESSION_PREFIX) ? [lock.name.slice(SESSION_PREFIX.length)] : []))
}
