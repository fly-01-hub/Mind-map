export const syncTables = ['documents', 'folders', 'versions', 'attachmentBlobs', 'papers', 'paperFiles', 'paperReadingStates', 'paperAnnotations', 'nodePaperRelations', 'annotationNodeRelations', 'meta'] as const
export type SyncTable = typeof syncTables[number]
export type SyncRow = Record<string, unknown>
export type SyncRows = Record<SyncTable, SyncRow[]>
export type SyncIndex = Record<SyncTable, Record<string, string>>
export interface SyncHead { serverId: string; revision: number; index: SyncIndex }
export interface SyncBinary { sha256: string; bytes: number; mimeType: string }
export const syncLocalMeta = (id: string) => id === 'initialized' || id === 'last-restored-at' || id.startsWith('device-sync:')
export const syncKey = (table: SyncTable, row: SyncRow) => String(row[table === 'meta' ? 'key' : table === 'paperFiles' || table === 'paperReadingStates' ? 'paperId' : 'id'])
export const emptySyncIndex = (): SyncIndex => Object.fromEntries(syncTables.map(t => [t, {}])) as SyncIndex
export const emptySyncRows = (): SyncRows => Object.fromEntries(syncTables.map(t => [t, [] as SyncRow[]])) as SyncRows
export const emptySyncKeys = (): Record<SyncTable, string[]> => Object.fromEntries(syncTables.map(t => [t, [] as string[]])) as Record<SyncTable, string[]>
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => (value as SyncRow)[k] !== undefined).map(k => [k, canonical((value as SyncRow)[k])]))
  return value
}
export const syncJson = (value: unknown) => JSON.stringify(canonical(value))
export const digestBytes = async (bytes: ArrayBuffer | Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
export const digestRow = (row: SyncRow) => digestBytes(new TextEncoder().encode(syncJson(row)))

// A missing row is a deletion only when it existed in the last common state.
// First pairing merges independent libraries instead of replacing either one.
export function planSync(base: SyncIndex, local: SyncIndex, remote: SyncIndex) {
  const upload = emptySyncKeys()
  const download = emptySyncKeys()
  const conflicts: Array<{ table: SyncTable; id: string }> = []
  for (const table of syncTables) for (const id of new Set([...Object.keys(base[table]), ...Object.keys(local[table]), ...Object.keys(remote[table])])) {
    const b = base[table][id], l = local[table][id], r = remote[table][id]
    if (l === r) continue
    if (l === b) download[table].push(id)
    else if (r === b) upload[table].push(id)
    else conflicts.push({ table, id })
  }
  return { upload, download, conflicts }
}
