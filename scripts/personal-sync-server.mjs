import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createSyncServer } from './sync/server.mjs'

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
const root = path.resolve(import.meta.dirname, '..')
const directory = path.resolve(option('--data') ?? path.join(os.homedir(), '.researchmind-sync'))
const publicOrigin = option('--public-url') ?? process.env.RESEARCHMIND_SYNC_PUBLIC_ORIGIN
const port = Number(option('--port') ?? 4180)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port')
await fs.mkdir(directory, { recursive: true, mode: 0o700 })
const lock = path.join(directory, 'server.lock')
try {
  try { const previous = Number(await fs.readFile(lock, 'utf8')); if (!Number.isSafeInteger(previous) || previous < 1) throw Error('Inspect the existing server.lock'); try { process.kill(previous, 0); throw Error('A sync server is already running') } catch (e) { if (e.code !== 'ESRCH') throw e } await fs.unlink(lock) } catch (e) { if (e.code !== 'ENOENT') throw e }
  await fs.writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
  const { server } = await createSyncServer({ directory, appDirectory: path.resolve(option('--app') ?? path.join(root, 'dist')), publicOrigin })
  const close = () => server.close(async () => { await fs.unlink(lock); process.exit(0) })
  process.on('SIGINT', close); process.on('SIGTERM', close)
  server.once('error', async error => { console.error(error.message); await fs.unlink(lock); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => {
    console.log('ResearchMind personal sync: http://127.0.0.1:' + port)
    console.log('Private data directory: ' + directory)
    console.log('Pairing key file (keep private): ' + path.join(directory, 'pairing-key.txt'))
    console.log(publicOrigin ? 'Other devices use: ' + publicOrigin : 'Use --public-url https://YOUR-MAC.YOUR-TAILNET.ts.net after enabling Tailscale Serve')
  })
} catch (error) { console.error(error.message); process.exitCode = 1 }
