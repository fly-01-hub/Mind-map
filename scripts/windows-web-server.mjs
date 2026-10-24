import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { loadAppSnapshot, createStaticHandler, parseSubnet } from './lan/static-server.mjs'

const root = path.resolve(import.meta.dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'web-config.json'), 'utf8'))
const handler = createStaticHandler({ files: loadAppSnapshot(path.join(root, 'app')), allowedHosts: new Set([`127.0.0.1:${config.port}`]), subnets: [parseSubnet('127.0.0.0/8')] })
// The original 4173 origin keeps the original IndexedDB/profile. Only the fixed
// personal-sync API path is proxied, to the fixed loopback sync service.
const server = http.createServer((request, response) => {
  response.setHeader('X-ResearchMind-Build', config.appIndexSha256)
  if (request.url?.startsWith('/api/personal-sync/') && request.headers.host === `127.0.0.1:${config.port}`) {
    const upstream = http.request({ hostname: '127.0.0.1', port: 4180, path: request.url, method: request.method, headers: { ...request.headers, host: '127.0.0.1:4180' } }, result => { response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response) })
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Personal sync service is not running' })) })
    request.on('aborted', () => upstream.destroy())
    request.pipe(upstream)
    return
  }
  handler(request, response)
})
server.requestTimeout = 10 * 60 * 1000
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
server.listen(config.port, '127.0.0.1', () => console.log(`ResearchMind ${config.version} local web: ${config.origin}/library`))
process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())
