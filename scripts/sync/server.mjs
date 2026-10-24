import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import http from 'node:http'
import crypto from 'node:crypto'
import path from 'node:path'
import { openSyncStore, fail } from './store.mjs'
import { loadAppSnapshot, createStaticHandler, parseSubnet } from '../lan/static-server.mjs'

const api = '/api/personal-sync'
async function body(request, max = 128 * 1024 * 1024) {
  let size = 0; const chunks = []
  for await (const chunk of request) { size += chunk.length; if (size > max) throw fail('Request too large', 413); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw fail('Invalid JSON') }
}
export async function createSyncServer({ directory, appDirectory, publicOrigin, clientOrigins = [] }) {
  if (publicOrigin && (new URL(publicOrigin).protocol !== 'https:' || new URL(publicOrigin).origin !== publicOrigin)) throw Error('Public URL must be an HTTPS origin')
  const store = await openSyncStore(directory)
  const origins = new Set(['http://127.0.0.1:4173', 'http://localhost:4173', ...clientOrigins, ...(publicOrigin ? [publicOrigin] : [])])
  for (const origin of origins) if (!/^https:\/\//.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw Error('Client origin must use HTTPS or loopback')
  const files = appDirectory ? loadAppSnapshot(appDirectory) : undefined
  const allowedHosts = new Set(publicOrigin ? [new URL(publicOrigin).host] : [])
  const serve = files ? createStaticHandler({ files, allowedHosts, subnets: [parseSubnet('127.0.0.0/8')] }) : undefined
  const secretDigest = crypto.createHash('sha256').update('Bearer ' + store.token).digest()
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const host = request.headers.host ?? ''
      const address = server.address()
      const ownOrigin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4180}`
      const ownHost = new URL(ownOrigin).host
      if (host !== ownHost && (!publicOrigin || host !== new URL(publicOrigin).host)) throw fail('Unexpected Host', 403)
      allowedHosts.add(ownHost)
      const origin = request.headers.origin
      if (origin && origin !== ownOrigin && !origins.has(origin)) throw fail('Origin is not paired', 403)
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        response.setHeader('Access-Control-Allow-Private-Network', 'true')
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
      if (url.pathname === api + '/health' && request.method === 'GET') return send(200, { application: 'ResearchMind personal sync', protocol: 1 })
      if (!url.pathname.startsWith(api + '/')) {
        if (serve) return serve(request, response)
        return send(404, { error: 'Not found' })
      }
      const digest = crypto.createHash('sha256').update(request.headers.authorization ?? '').digest()
      if (!crypto.timingSafeEqual(digest, secretDigest)) throw fail('Pairing key is incorrect', 401)
      if (request.method === 'GET' && url.pathname === api + '/head') return send(200, store.head())
      if (request.method === 'POST' && url.pathname === api + '/rows') return send(200, store.read((await body(request, 4 * 1024 * 1024)).keys))
      if (request.method === 'POST' && url.pathname === api + '/commit') return send(200, await store.commit(await body(request)))
      if (request.method === 'POST' && url.pathname === api + '/missing') {
        const { hashes } = await body(request, 1024 * 1024)
        if (!Array.isArray(hashes) || hashes.length > 10000 || hashes.some(h => !/^[a-f0-9]{64}$/.test(h))) throw fail('Invalid object keys')
        const missing = []
        for (const hash of hashes) if (!await store.exists(hash)) missing.push(hash)
        return send(200, { missing })
      }
      const binary = new RegExp('^' + api + '/objects/([a-f0-9]{64})$').exec(url.pathname)
      if (binary && request.method === 'GET') {
        const file = store.file(binary[1])
        if (!await store.exists(binary[1])) throw fail('Binary not found', 404)
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': (await fs.stat(file)).size })
        createReadStream(file).on('error', () => response.destroy()).pipe(response)
        return
      }
      if (binary && request.method === 'PUT') {
        const temp = path.join(store.root, 'objects', crypto.randomUUID() + '.upload')
        const handle = await fs.open(temp, 'wx', 0o600)
        let count = 0; const hash = crypto.createHash('sha256')
        try {
          for await (const chunk of request) {
            count += chunk.length; if (count > 1024 ** 3) throw fail('Binary too large', 413)
            hash.update(chunk)
            let offset = 0
            while (offset < chunk.length) { const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset); if (!bytesWritten) throw Error('File write stopped'); offset += bytesWritten }
          }
          if (hash.digest('hex') !== binary[1]) throw fail('Binary integrity check failed')
          await handle.sync(); await handle.close()
          if (await store.exists(binary[1])) await fs.unlink(temp)
          else await fs.rename(temp, store.file(binary[1]))
          return send(200, { bytes: count })
        } catch (error) { await handle.close().catch(() => undefined); await fs.unlink(temp).catch(() => undefined); throw error }
      }
      return send(404, { error: 'Not found' })
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      send(error.status ?? 500, { error: error.status ? error.message : 'Sync storage operation failed; existing data was retained' })
    }
  })
  server.requestTimeout = 10 * 60 * 1000
  return { server, store }
}
