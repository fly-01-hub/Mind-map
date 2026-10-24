import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createSyncServer } from '../../scripts/sync/server.mjs'
import { hash } from '../../scripts/sync/store.mjs'

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'researchmind-sync-test-'))
  const { server, store } = await createSyncServer({ directory, clientOrigins: ['http://127.0.0.1:5176'] })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port, api = origin + '/api/personal-sync'
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('researchmind-sync-test-')) throw Error('Refuse unsafe cleanup')
    await fs.rm(directory, { recursive: true, force: true })
  })
  const request = async (route, body, options = {}) => fetch(api + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + store.token, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5176', ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options })
  const head = async () => (await request('/head')).json()
  return { directory, server, store, api, origin, request, head }
}
test('authenticated records and PDFs survive restart; stale commits cannot overwrite data', async t => {
  const f = await fixture(t), first = await f.head(), bytes = Buffer.from('%PDF-test'), digest = hash(bytes)
  assert.equal((await fetch(f.api + '/head')).status, 401)
  assert.equal((await f.request('/head', undefined, { headers: { Authorization: 'Bearer ' + f.store.token, Origin: 'https://untrusted.example' } })).status, 403)
  assert.equal((await f.request('/missing', { hashes: [digest] })).status, 200)
  const upload = await fetch(f.api + '/objects/' + digest, { method: 'PUT', headers: { Authorization: 'Bearer ' + f.store.token }, body: bytes })
  assert.equal(upload.status, 200)
  const commit = { ...first, upserts: { paperFiles: [{ paperId: 'paper', cachedAt: 'today', blob: { sha256: digest, bytes: bytes.length, mimeType: 'application/pdf' } }] }, deletes: {} }
  assert.equal((await f.request('/commit', commit)).status, 200)
  assert.equal((await f.request('/commit', commit)).status, 409)
  const second = await f.head()
  assert.equal(second.revision, 1)
  assert.ok(second.index.paperFiles.paper)
  const row = await (await f.request('/rows', { keys: { paperFiles: ['paper'] } })).json()
  assert.equal(row.rows.paperFiles[0].blob.sha256, digest)
  assert.deepEqual(Buffer.from(await (await f.request('/objects/' + digest)).arrayBuffer()), bytes)
  assert.deepEqual(await (await f.request('/missing', { hashes: [digest] })).json(), { missing: [] })
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory, 'state.json'), 'utf8')).revision, 1)
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory, 'history/0.json'), 'utf8')).revision, 0)
})
test('corrupt or missing binaries and malformed trees do not commit', async t => {
  const f = await fixture(t), initial = await f.head(), digest = hash('correct')
  assert.equal((await fetch(f.api + '/objects/' + digest, { method: 'PUT', headers: { Authorization: 'Bearer ' + f.store.token }, body: 'incorrect' })).status, 400)
  assert.equal((await f.request('/commit', { ...initial, upserts: { paperFiles: [{ paperId: 'p', blob: { sha256: digest, bytes: 7, mimeType: 'application/pdf' } }] }, deletes: {} })).status, 400)
  assert.equal((await f.request('/commit', { ...initial, upserts: { documents: [{ id: 'broken', root: {} }] }, deletes: {} })).status, 400)
  assert.equal((await f.head()).revision, 0)
})
test('parallel writers serialize and only one writer can claim a revision', async t => {
  const f = await fixture(t), initial = await f.head()
  const write = id => f.request('/commit', { ...initial, upserts: { folders: [{ id, name: id }] }, deletes: {} })
  const results = await Promise.all([write('one'), write('two')])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
  assert.equal(Object.keys((await f.head()).index.folders).length, 1)
})
test('rejects device secrets, unknown tables and path traversal', async t => {
  const f = await fixture(t), initial = await f.head()
  assert.equal((await f.request('/commit', { ...initial, upserts: { meta: [{ key: 'device-sync:baseline-v1', value: 'private' }] }, deletes: {} })).status, 400)
  assert.equal((await f.request('/rows', { keys: { credentials: ['key'] } })).status, 400)
  assert.equal((await f.request('/objects/..%2fstate.json')).status, 404)
  assert.equal((await f.head()).revision, 0)
})
