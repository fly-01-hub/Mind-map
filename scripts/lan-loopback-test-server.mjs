import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLoopbackTestServer, loadAppSnapshot } from './lan/static-server.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const server = createLoopbackTestServer({ files: loadAppSnapshot(path.join(projectRoot, 'dist')), port: 5198 })
server.once('error', (error) => { console.error(error.message); process.exitCode = 1 })
server.listen(5198, '127.0.0.1', () => console.log('Isolated LAN-handler browser tests: http://127.0.0.1:5198'))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections() })
