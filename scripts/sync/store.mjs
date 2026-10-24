import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const tables = ['documents', 'folders', 'versions', 'attachmentBlobs', 'papers', 'paperFiles', 'paperReadingStates', 'paperAnnotations', 'nodePaperRelations', 'annotationNodeRelations', 'meta']
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])])) : value
export const json = value => JSON.stringify(canonical(value))
export const hash = value => crypto.createHash('sha256').update(value).digest('hex')
export const key = (t, row) => row[t === 'meta' ? 'key' : ['paperFiles', 'paperReadingStates'].includes(t) ? 'paperId' : 'id']
export const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function validateRow(t, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof key(t, row) !== 'string' || !key(t, row) || key(t, row).length > 1024 || ['__proto__', 'constructor', 'prototype'].includes(key(t, row))) throw fail('Invalid record')
  if (t === 'meta' && (['initialized', 'last-restored-at'].includes(row.key) || row.key.startsWith('device-sync:'))) throw fail('Device-local metadata must not be uploaded')
  if (t === 'documents' || t === 'versions') {
    const pending = [row.root], seen = new Set()
    while (pending.length) {
      const node = pending.pop()
      if (!node || typeof node.id !== 'string' || seen.has(node.id) || typeof node.title !== 'string' || !Array.isArray(node.children)) throw fail('Invalid node tree')
      seen.add(node.id); pending.push(...node.children)
    }
  }
  if (['attachmentBlobs', 'paperFiles'].includes(t)) {
    const b = row.blob
    if (!b || !validHash(b.sha256) || !Number.isSafeInteger(b.bytes) || b.bytes < 0 || b.bytes > 1024 ** 3 || typeof b.mimeType !== 'string') throw fail('Invalid binary descriptor')
  }
}
export async function openSyncStore(directory) {
  const root = path.resolve(directory), objects = path.join(root, 'objects'), stateFile = path.join(root, 'state.json')
  await fs.mkdir(objects, { recursive: true, mode: 0o700 })
  await fs.mkdir(path.join(root, 'history'), { recursive: true, mode: 0o700 })
  const secretFile = path.join(root, 'pairing-key.txt')
  try { await fs.writeFile(secretFile, crypto.randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }) } catch (e) { if (e.code !== 'EEXIST') throw e }
  const token = (await fs.readFile(secretFile, 'utf8')).trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Invalid pairing key file')
  let state
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')) } catch (e) {
    if (e.code !== 'ENOENT') throw e
    state = { format: 'researchmind-personal-sync', serverId: crypto.randomUUID(), revision: 0, tables: Object.fromEntries(tables.map(t => [t, {}])) }
    await fs.writeFile(stateFile, JSON.stringify(state), { flag: 'wx', mode: 0o600 })
  }
  if (state.format !== 'researchmind-personal-sync' || typeof state.serverId !== 'string' || !Number.isSafeInteger(state.revision) || tables.some(t => !state.tables?.[t])) throw Error('Cannot safely read sync storage')
  for (const t of tables) for (const [id, row] of Object.entries(state.tables[t])) { validateRow(t, row); if (key(t, row) !== id) throw Error('Corrupt sync record') }
  let queue = Promise.resolve()
  const file = digest => { if (!validHash(digest)) throw fail('Invalid object key'); return path.join(objects, digest + '.bin') }
  const exists = async digest => { try { return (await fs.stat(file(digest))).isFile() } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
  let cachedHead
  const head = () => cachedHead ??= ({ serverId: state.serverId, revision: state.revision, index: Object.fromEntries(tables.map(t => [t, Object.fromEntries(Object.entries(state.tables[t]).map(([id, row]) => [id, hash(json(row))]))])) })
  return {
    root, token, file, exists, head,
    read(keys) {
      if (!keys || Object.keys(keys).some(t => !tables.includes(t))) throw fail('Invalid table')
      return { revision: state.revision, rows: Object.fromEntries(tables.map(t => {
        const ids = keys[t] ?? []
        if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw fail('Invalid record keys')
        return [t, ids.flatMap(id => Object.hasOwn(state.tables[t], id) ? [state.tables[t][id]] : [])]
      })) }
    },
    commit(input) {
      const run = queue.then(async () => {
        if (!input || input.revision !== state.revision || input.serverId !== state.serverId) throw fail('Other device updated the library; retry', 409)
        if (!input.upserts || !input.deletes || Object.keys(input.upserts).some(t => !tables.includes(t)) || Object.keys(input.deletes).some(t => !tables.includes(t))) throw fail('Invalid commit')
        const next = { ...state, revision: state.revision + 1, tables: { ...state.tables } }
        for (const t of tables) {
          const upserts = input.upserts[t] ?? [], deletes = input.deletes[t] ?? []
          if (!Array.isArray(upserts) || !Array.isArray(deletes) || deletes.some(id => typeof id !== 'string' || id.length > 1024)) throw fail('Invalid commit records')
          next.tables[t] = { ...state.tables[t] }
          for (const id of deletes) delete next.tables[t][id]
          const seen = new Set()
          for (const row of upserts) {
            validateRow(t, row)
            const id = key(t, row)
            if (seen.has(id)) throw fail('Duplicate record')
            seen.add(id)
            if (['attachmentBlobs', 'paperFiles'].includes(t)) {
              if (!await exists(row.blob.sha256) || (await fs.stat(file(row.blob.sha256))).size !== row.blob.bytes) throw fail('A PDF or attachment is missing')
            }
            Object.defineProperty(next.tables[t], id, { value: row, enumerable: true, configurable: true, writable: true })
          }
        }
        // Keep the previous metadata revision, then atomically replace the live
        // state. Binaries are immutable and never garbage-collected implicitly.
        await fs.copyFile(stateFile, path.join(root, 'history', `${state.revision}.json`))
        const temp = stateFile + '.' + crypto.randomUUID() + '.tmp'
        const handle = await fs.open(temp, 'wx', 0o600)
        try { await handle.writeFile(JSON.stringify(next)); await handle.sync() } finally { await handle.close() }
        await fs.rename(temp, stateFile)
        state = next
        cachedHead = undefined
        const histories = (await fs.readdir(path.join(root, 'history'))).filter(n => /^\d+\.json$/.test(n)).sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
        for (const name of histories.slice(20)) await fs.unlink(path.join(root, 'history', name))
        return head()
      })
      queue = run.catch(() => undefined)
      return run
    },
  }
}
