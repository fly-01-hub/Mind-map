import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { validateConfig } from './lan/static-server.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: npm run lan:cert-request -- [--config config/lan.local.json]')
  console.log('Creates a server key and CSR for administrator signing. Does not create/install a root CA or change firewall settings.')
  process.exit(0)
}
try {
  const configIndex = args.indexOf('--config')
  const configFile = path.resolve(projectRoot, configIndex < 0 ? 'config/lan.local.json' : args[configIndex + 1] ?? '')
  const config = validateConfig(JSON.parse(readFileSync(configFile, 'utf8')))
  const keyFile = path.resolve(path.dirname(configFile), config.tls.privateKeyFile)
  const privateDirectory = path.join(projectRoot, '.lan-private')
  const csrFile = path.join(privateDirectory, 'server-request.csr')
  if (existsSync(keyFile) || existsSync(csrFile)) throw new Error('Key/CSR already exists; nothing was overwritten')
  const distributionRoot = path.join(projectRoot, 'dist')
  for (const file of [keyFile, csrFile]) {
    const relative = path.relative(distributionRoot, file)
    if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('TLS material must be outside dist')
  }
  const gitOpenSsl = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe')
  const openssl = process.env.RESEARCHMIND_OPENSSL ?? (process.platform === 'win32' && existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl')
  execFileSync(openssl, ['version'], { stdio: ['ignore', 'ignore', 'pipe'] })
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 })
  mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 })
  const hostname = new URL(config.publicOrigin).hostname
  const sans = [...new Set([`IP:${config.listenAddress}`, isIP(hostname) ? `IP:${hostname}` : `DNS:${hostname}`])].join(',')
  execFileSync(openssl, ['req', '-new', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-subj', `/CN=${hostname}`,
    '-addext', `subjectAltName=${sans}`, '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment', '-addext', 'extendedKeyUsage=serverAuth',
    '-keyout', keyFile, '-out', csrFile], { stdio: ['ignore', 'ignore', 'pipe'] })
  console.log(JSON.stringify({ csrFile, privateKeyFile: keyFile, requestedNames: sans,
    next: 'Give only the CSR to your certificate administrator. Keep the private key on this server. A signed, client-trusted certificate is still required.',
    systemTrustChanged: false, firewallChanged: false }, null, 2))
} catch (error) {
  console.error(`Certificate request stopped: ${error.message}`)
  process.exitCode = 1
}
