import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createLanServer, loadAppSnapshot, loadTls, validateConfig } from './lan/static-server.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const argumentsList = process.argv.slice(2)
if (argumentsList.includes('--help')) {
  console.log('Usage: npm run lan:serve -- [--config config/lan.local.json] [--check]')
  console.log('Requires a valid server certificate trusted by each client. No HTTP LAN mode, certificate bypass or data upload API.')
  process.exit(0)
}
const configIndex = argumentsList.indexOf('--config')
const configFile = path.resolve(projectRoot, configIndex < 0 ? 'config/lan.local.json' : argumentsList[configIndex + 1] ?? '')
try {
  const config = validateConfig(JSON.parse(readFileSync(configFile, 'utf8')))
  const files = loadAppSnapshot(path.join(projectRoot, 'dist'))
  const tls = loadTls(config, path.dirname(configFile), path.join(projectRoot, 'dist'))
  if (argumentsList.includes('--check')) {
    console.log(JSON.stringify({ valid: true, origin: config.publicOrigin, listenAddress: config.listenAddress, compiledFiles: files.size, certificate: tls.certificate, storage: 'browser-local' }, null, 2))
  } else {
    const server = createLanServer({ files, allowedHosts: new Set([new URL(config.publicOrigin).host.toLowerCase()]), subnets: config.subnets, tls: tls.options })
    server.once('error', (error) => { console.error(`LAN service stopped: ${error.message}`); process.exitCode = 1 })
    server.listen(config.port, config.listenAddress, () => {
      console.log(`ResearchMind LAN: ${config.publicOrigin}/library`)
      console.log('Read-only program files. Documents, PDFs, backups and annotations remain in each browser.')
      console.log('Clients must trust the certificate issuer. No firewall or system trust settings were changed.')
    })
    const stop = () => { server.close(); server.closeIdleConnections() }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
} catch (error) {
  console.error(`LAN service not started: ${error.message}`)
  console.error('See docs/LAN.md. Missing/untrusted certificates require administrator configuration; do not bypass warnings.')
  process.exitCode = 1
}
