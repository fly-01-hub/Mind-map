import { create } from 'zustand'
import Dexie from 'dexie'
import { appDatabase } from '../../db/appDatabase'
import { readAllTables, type LocalRows } from '../backup/localBackupService'
import { prepareForNavigation, synchronizeLocalWorkspace } from '../persistence/localPersistence'
import { withWorkspaceTransaction } from '../persistence/windowCoordination'
import { usePaperStore } from '../../stores/paperStore'
import { useSaveStore } from '../../stores/saveStore'
import { digestBytes, digestRow, emptySyncIndex, emptySyncKeys, emptySyncRows, planSync, syncJson, syncKey, syncLocalMeta, syncTables, type SyncBinary, type SyncHead, type SyncIndex, type SyncRow, type SyncRows, type SyncTable } from './protocol'

export interface SyncConfig { url: string; token: string; automatic: boolean }
const configKey = 'researchmind-personal-sync-v1', baselineKey = 'device-sync:baseline-v1'
interface Baseline { serverId: string; index: SyncIndex; url: string }
interface SyncStatus { busy: boolean; message: string; error?: string; lastSuccess?: string; configured: boolean }
export const useSyncStatus = create<SyncStatus>(() => ({ busy: false, message: '未连接设备同步', configured: false }))
const blobCache = new Map<string, { fingerprint: string; descriptor: SyncBinary }>()
let pending: Promise<void> | undefined, installed = false, restoredAt: string | undefined
let mutationSerial = 0
let checked: { url: string; serverId: string; revision: number; mutation: number } | undefined
Dexie.on('storagemutated', parts => {
  const prefix = 'idb://' + appDatabase.name + '/'
  const names = Object.keys(parts).filter(p => p.startsWith(prefix))
  if (names.length) mutationSerial++
  if (names.some(p => p.startsWith(prefix + 'paperFiles/') || p.startsWith(prefix + 'attachmentBlobs/'))) blobCache.clear()
})

export function loadSyncConfig(): SyncConfig | undefined {
  try { const c = JSON.parse(localStorage.getItem(configKey) ?? 'null'); if (c && typeof c.url === 'string' && typeof c.token === 'string') return c } catch { /* Leave malformed configuration disconnected. */ }
}
export function saveSyncConfig(value?: SyncConfig) {
  if (value) {
    const url = new URL(value.url.trim())
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw Error('请填写同步服务首页地址，不包含路径、参数或密钥。')
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw Error('同步地址需使用 HTTPS。')
    if (!/^[A-Za-z0-9_-]{43}$/.test(value.token.trim())) throw Error('配对密钥格式不正确，请完整复制主机生成的密钥。')
    localStorage.setItem(configKey, JSON.stringify({ ...value, url: url.origin, token: value.token.trim() }))
  } else localStorage.removeItem(configKey)
  useSyncStatus.setState({ configured: !!value, error: undefined, message: value ? '已配置，可立即同步' : '已断开，本机资料保留' })
}

class SyncHttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status } }
async function request(config: SyncConfig, route: string, options: RequestInit = {}) {
  const response = await fetch(config.url + '/api/personal-sync' + route, { ...options, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10 * 60_000), headers: { Authorization: 'Bearer ' + config.token, ...(options.body instanceof Blob ? {} : { 'Content-Type': 'application/json' }), ...options.headers } })
  if (!response.ok) {
    if (response.status === 401) throw new SyncHttpError(401, '配对密钥不正确，请重新复制 Windows 同步主机的密钥。')
    if (response.status === 409) throw new SyncHttpError(409, '其他设备刚更新了资料，将重新检查后同步。')
    throw new SyncHttpError(response.status, '同步服务处理失败，现有资料已保留。')
  }
  return response
}
function validHead(value: unknown): SyncHead {
  const v = value as SyncHead
  if (!v || typeof v.serverId !== 'string' || !Number.isSafeInteger(v.revision) || !v.index || syncTables.some(t => !v.index[t] || typeof v.index[t] !== 'object' || Object.entries(v.index[t]).some(([id, hash]) => !id || !/^[a-f0-9]{64}$/.test(hash)))) throw Error('同步服务返回的数据格式不正确。')
  return v
}
const isBinary = (t: SyncTable) => t === 'attachmentBlobs' || t === 'paperFiles'
function fingerprint(row: SyncRow) {
  const { blob, ...metadata } = row
  return syncJson({ ...metadata, ...(blob instanceof Blob ? { binaryBytes: blob.size, binaryMime: blob.type } : {}) })
}
async function encode(rows: LocalRows) {
  const wire = emptySyncRows(), index = emptySyncIndex(), binaries = new Map<string, Blob>()
  const timestamp = rows.meta.find(m => m.key === 'last-restored-at')?.value
  if (timestamp !== restoredAt) { blobCache.clear(); restoredAt = timestamp }
  for (const table of syncTables) for (const value of rows[table]) {
    const row = value as unknown as SyncRow, id = syncKey(table, row)
    if (table === 'meta' && syncLocalMeta(id)) continue
    let encoded = row
    if (isBinary(table)) {
      const blob = row.blob as Blob, cacheKey = table + ':' + id, stamp = fingerprint(row)
      let descriptor = blobCache.get(cacheKey)?.fingerprint === stamp ? blobCache.get(cacheKey)!.descriptor : undefined
      if (!descriptor) { descriptor = { sha256: await digestBytes(await blob.arrayBuffer()), bytes: blob.size, mimeType: blob.type || 'application/octet-stream' }; blobCache.set(cacheKey, { fingerprint: stamp, descriptor }) }
      encoded = { ...row, blob: descriptor }; binaries.set(descriptor.sha256, blob)
    }
    wire[table].push(encoded)
    Object.defineProperty(index[table], id, { value: await digestRow(encoded), enumerable: true, configurable: true, writable: true })
  }
  return { wire, index, binaries }
}
const hasKeys = (keys: Record<SyncTable, string[]>) => syncTables.some(t => keys[t].length)
async function synchronize(config: SyncConfig) {
  const head = validHead(await (await request(config, '/head')).json())
  if (checked?.url === config.url && checked.serverId === head.serverId && checked.revision === head.revision && checked.mutation === mutationSerial && useSaveStore.getState().status === 'local') return
  await prepareForNavigation()
  const sourceMutation = mutationSerial
  const source = await readAllTables()
  useSyncStatus.setState({ message: '正在检查本机改动…' })
  const local = await encode(source)
  const stored = source.meta.find(m => m.key === baselineKey)
  const previous = stored ? JSON.parse(stored.value) as Baseline : undefined
  const base = previous?.serverId === head.serverId && previous.url === config.url ? previous.index : emptySyncIndex()
  const plan = planSync(base, local.index, head.index)
  if (plan.conflicts.length) {
    const labels = plan.conflicts.slice(0, 3).map(({ table, id }) => table === 'documents' ? source.documents.find(d => d.id === id)?.title ?? id : table === 'paperAnnotations' ? '论文批注' : '资料记录')
    throw Error(`发现 ${plan.conflicts.length} 处双向修改（${labels.join('、')}）。本机和主机内容均保留，未相互覆盖。请先导出本机完整备份，再处理冲突；不同导图的独立修改可以正常合并。`)
  }
  const downloadRows = emptySyncRows()
  if (hasKeys(plan.download)) {
    useSyncStatus.setState({ message: '正在接收其他设备的改动…' })
    const remote = await (await request(config, '/rows', { method: 'POST', body: JSON.stringify({ keys: plan.download }) })).json() as { revision: number; rows: SyncRows }
    if (remote.revision !== head.revision) throw new SyncHttpError(409, '主机资料刚发生变化，稍后重新同步。')
    for (const table of syncTables) {
      if (!Array.isArray(remote.rows?.[table])) throw Error('收到不完整的同步资料。')
      const seen = new Set<string>()
      for (const row of remote.rows[table]) {
        const id = syncKey(table, row)
        if (!plan.download[table].includes(id) || seen.has(id) || await digestRow(row) !== head.index[table][id]) throw Error('同步资料校验失败，已停止写入。')
        seen.add(id)
        if (isBinary(table)) {
          const d = row.blob as SyncBinary
          if (!d || !/^[a-f0-9]{64}$/.test(d.sha256) || !Number.isSafeInteger(d.bytes) || d.bytes < 0 || d.bytes > 1024 ** 3 || typeof d.mimeType !== 'string') throw Error('同步文件描述无效。')
          let blob = local.binaries.get(d.sha256)
          if (!blob) {
            const received = await (await request(config, '/objects/' + d.sha256)).blob()
            if (received.size !== d.bytes || await digestBytes(await received.arrayBuffer()) !== d.sha256) throw Error('下载的 PDF 或附件校验失败，原有资料保留。')
            blob = new Blob([received], { type: d.mimeType })
          }
          downloadRows[table].push({ ...row, blob })
        } else downloadRows[table].push(row)
      }
      for (const id of plan.download[table]) if (head.index[table][id] && !seen.has(id)) throw Error('同步资料缺少记录，已停止写入。')
    }
  }
  let finalHead = head
  if (hasKeys(plan.upload)) {
    const upserts = emptySyncRows(), deletes = emptySyncKeys()
    const needed = new Set<string>()
    for (const table of syncTables) for (const id of plan.upload[table]) {
      const row = local.wire[table].find(r => syncKey(table, r) === id)
      if (row) { upserts[table].push(row); if (isBinary(table)) needed.add((row.blob as SyncBinary).sha256) } else deletes[table].push(id)
    }
    const { missing } = await (await request(config, '/missing', { method: 'POST', body: JSON.stringify({ hashes: [...needed] }) })).json() as { missing: string[] }
    if (!Array.isArray(missing) || missing.some(h => !needed.has(h))) throw Error('同步文件检查响应无效。')
    for (const [i, hash] of missing.entries()) {
      const blob = local.binaries.get(hash)
      if (!blob) throw Error('本机缺少待上传的文件。')
      useSyncStatus.setState({ message: `正在上传 PDF／附件 ${i + 1} / ${missing.length}，首次同步请保持窗口打开…` })
      await request(config, '/objects/' + hash, { method: 'PUT', body: blob })
    }
    useSyncStatus.setState({ message: '正在保存改动到 Windows 同步主机…' })
    finalHead = validHead(await (await request(config, '/commit', { method: 'POST', body: JSON.stringify({ serverId: head.serverId, revision: head.revision, upserts, deletes }) })).json())
  }
  if (!hasKeys(plan.upload) && !hasKeys(plan.download) && previous?.serverId === head.serverId && previous.url === config.url && syncJson(base) === syncJson(head.index)) { checked = { url: config.url, serverId: head.serverId, revision: head.revision, mutation: sourceMutation }; return }
  // Acknowledged uploads remain a common baseline even if another local edit
  // arrived while uploading. Never write an old downloaded row over such edits.
  const acknowledged = structuredClone(base)
  for (const table of syncTables) for (const id of plan.upload[table]) {
    if (finalHead.index[table][id]) Object.defineProperty(acknowledged[table], id, { value: finalHead.index[table][id], enumerable: true, configurable: true, writable: true })
    else delete acknowledged[table][id]
  }
  await prepareForNavigation()
  if (loadSyncConfig()?.url !== config.url || loadSyncConfig()?.token !== config.token) throw Error('同步设置已变化，本机资料未被替换。')
  let changedDuringDownload = false
  await withWorkspaceTransaction(async () => {
    await appDatabase.transaction('rw', appDatabase.tables, async () => {
      for (const table of syncTables) for (const id of plan.download[table]) {
        const current = await appDatabase.table(table).get(id)
        const expected = (source[table] as unknown as SyncRow[]).find(r => syncKey(table, r) === id)
        if (current === undefined ? expected !== undefined : expected === undefined || fingerprint(current) !== fingerprint(expected)) changedDuringDownload = true
      }
      if (!changedDuringDownload) {
        for (const table of syncTables) {
          const rows = downloadRows[table]
          if (rows.length) await appDatabase.table(table).bulkPut(rows)
          const deleted = plan.download[table].filter(id => !head.index[table][id])
          if (deleted.length) await appDatabase.table(table).bulkDelete(deleted)
        }
      }
      const baseline: Baseline = { serverId: finalHead.serverId, url: config.url, index: changedDuringDownload ? acknowledged : finalHead.index }
      await appDatabase.meta.put({ key: baselineKey, value: JSON.stringify(baseline) })
    })
  })
  if (changedDuringDownload) throw new SyncHttpError(409, '接收期间本机仍在编辑，已保留本机内容，将重新检查。')
  await synchronizeLocalWorkspace()
  await usePaperStore.getState().refresh()
  checked = { url: config.url, serverId: finalHead.serverId, revision: finalHead.revision, mutation: sourceMutation }
}

export function syncNow() {
  if (pending) return pending
  const config = loadSyncConfig()
  if (!config) return Promise.resolve()
  useSyncStatus.setState({ busy: true, configured: true, error: undefined, message: '正在连接同步主机…' })
  const operation = async () => {
    for (let retry = 0; ; retry++) {
      try { await synchronize(config); break } catch (error) { if (error instanceof SyncHttpError && error.status === 409 && retry < 2) continue; throw error }
    }
  }
  pending = (navigator.locks ? navigator.locks.request('researchmind-personal-sync-v1', operation) : operation())
    .then(() => useSyncStatus.setState({ error: undefined, lastSuccess: new Date().toISOString(), message: '已同步，导图与文献已保留在本机' }))
    .catch(error => {
      const message = error instanceof TypeError || error instanceof DOMException && error.name === 'TimeoutError' ? '暂时无法连接 Windows 同步主机。请检查主机和 Tailscale；本机仍可继续使用，连接恢复后会重试。' : error instanceof Error ? error.message : '同步失败，本机资料保留。'
      useSyncStatus.setState({ error: message, message: '同步未完成，本机资料保留' })
      throw error
    }).finally(() => { pending = undefined; useSyncStatus.setState({ busy: false }) })
  return pending
}

export function startPersonalSync() {
  if (installed) return
  installed = true
  useSyncStatus.setState({ configured: !!loadSyncConfig() })
  const automatic = () => {
    if (!loadSyncConfig()?.automatic || pending) return
    const active = document.activeElement
    // Do not blur a user who is still typing. A manual sync or leaving the
    // editor commits drafts; background synchronization waits for an idle view.
    if (document.visibilityState === 'visible' && active instanceof HTMLElement && (active.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active.tagName))) return
    void syncNow().catch(() => undefined)
  }
  window.addEventListener('online', automatic)
  window.addEventListener('focus', automatic)
  document.addEventListener('visibilitychange', automatic)
  window.setInterval(automatic, 30_000)
  window.setTimeout(automatic, 3000)
}
