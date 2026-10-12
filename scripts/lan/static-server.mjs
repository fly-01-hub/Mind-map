import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream',
}
const privateSegments = new Set(['src', 'electron', 'android', 'scripts', 'config', 'release', 'node_modules', 'indexeddb', 'local storage'])
const shellRoutes = /^\/(?:$|(?:library|annotations|login)\/?$|(?:map|paper)\/[^/]+\/?$)/
const assetPattern = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i

function ipv4Number(address) {
  if (isIP(address) !== 4) throw new Error('Only IPv4 addresses are supported for this LAN service')
  return address.split('.').reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0)
}

export function isPrivateAddress(address) {
  if (isIP(address) !== 4) return false
  const [first, second] = address.split('.').map(Number)
  return first === 127 || first === 10 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168
}

export function parseSubnet(value) {
  if (typeof value !== 'string') throw new Error('Client subnets must be IPv4 CIDR strings')
  const parts = value.split('/')
  const prefix = Number(parts[1])
  if (parts.length !== 2 || !/^\d+$/.test(parts[1]) || !Number.isInteger(prefix) || prefix < 8 || prefix > 32) throw new Error('Client subnets must be private IPv4 CIDRs with a prefix between 8 and 32')
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  const start = (ipv4Number(parts[0]) & mask) >>> 0
  const end = (start | (~mask >>> 0)) >>> 0
  const toAddress = (number) => [24, 16, 8, 0].map((shift) => (number >>> shift) & 255).join('.')
  if (!isPrivateAddress(toAddress(start)) || !isPrivateAddress(toAddress(end))) throw new Error('Public client subnets are not allowed')
  return { mask, start }
}

export function addressInSubnets(address, subnets) {
  const normalized = address?.replace(/^::ffff:/, '')
  if (normalized === '::1') return true
  if (isIP(normalized ?? '') !== 4) return false
  if (normalized.startsWith('127.')) return true
  return subnets.some(({ mask, start }) => ((ipv4Number(normalized) & mask) >>> 0) === start)
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('A LAN configuration object is required')
  if (!isPrivateAddress(config.listenAddress)) throw new Error('Bind to one explicit private/loopback IPv4 address, not 0.0.0.0 or a public address')
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Choose a port between 1024 and 65535')
  const origin = new URL(config.publicOrigin)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || Number(origin.port || 443) !== config.port) throw new Error('publicOrigin must be a bare HTTPS origin matching the configured port')
  if (!Array.isArray(config.allowedClientSubnets) || !config.allowedClientSubnets.length) throw new Error('At least one permitted private client subnet is required')
  const subnets = config.allowedClientSubnets.map(parseSubnet)
  if (!addressInSubnets(config.listenAddress, subnets)) throw new Error('The listening address must be in a permitted client subnet')
  if (!config.tls?.certificateFile || !config.tls?.privateKeyFile) throw new Error('TLS certificate and private key files are required')
  return { ...config, publicOrigin: origin.origin, subnets }
}

function outsideRoot(file, root) {
  const relative = path.relative(root, file)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
}

export function loadTls(config, configDirectory, distributionRoot) {
  const root = realpathSync(distributionRoot)
  const loadPrivateFile = (configured) => {
    const file = realpathSync(path.resolve(configDirectory, configured))
    if (!outsideRoot(file, root)) throw new Error('Certificates and keys must be kept outside the served dist directory')
    return readFileSync(file)
  }
  const cert = loadPrivateFile(config.tls.certificateFile)
  const key = loadPrivateFile(config.tls.privateKeyFile)
  const passphrase = process.env.RESEARCHMIND_TLS_PASSPHRASE
  const leaf = new X509Certificate(cert)
  if (Date.now() < Date.parse(leaf.validFrom) || Date.now() >= Date.parse(leaf.validTo)) throw new Error('TLS certificate is not currently valid')
  if (leaf.ca) throw new Error('Use a server certificate, not a CA certificate, for the website')
  const hostname = new URL(config.publicOrigin).hostname
  if (!(isIP(hostname) ? leaf.checkIP(hostname) : leaf.checkHost(hostname, { subject: 'never' }))) throw new Error('TLS certificate SAN does not match publicOrigin')
  if (!leaf.checkPrivateKey(createPrivateKey({ key, passphrase }))) throw new Error('TLS certificate and private key do not match')
  return { options: { cert, key, passphrase, minVersion: 'TLSv1.2' }, certificate: { subject: leaf.subject, issuer: leaf.issuer, validTo: leaf.validTo } }
}

// Snapshot only the compiled app. Never serve the project root, personal files,
// source maps, certificates, backups or browser profiles, even if copied to dist.
export function loadAppSnapshot(distributionRoot) {
  const root = realpathSync(distributionRoot)
  const files = new Map()
  function visit(directory, relativeDirectory = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (relative === 'assets' || relative.startsWith('assets/') || relative === 'icons') visit(file, relative)
        continue
      }
      const extension = path.extname(relative).toLowerCase()
      const allowed = ['index.html', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'app-icon.svg'].includes(relative)
        || /^workbox-[A-Za-z0-9_-]+\.js$/.test(relative)
        || /^icons\/[^/]+\.(?:png|svg|ico)$/.test(relative)
        || assetPattern.test(relative) && Object.hasOwn(mimeTypes, extension)
      if (!allowed || !entry.isFile() || !Object.hasOwn(mimeTypes, extension)) continue
      if (!outsideRoot(realpathSync(file), root)) {
        const body = readFileSync(file)
        if (body.length > 32 * 1024 * 1024) throw new Error('A compiled asset exceeds the LAN service file size limit')
        files.set(`/${relative}`, { body, mime: mimeTypes[extension], immutable: relative.startsWith('assets/') })
      }
    }
  }
  visit(root)
  if (!files.has('/index.html')) throw new Error('Build the app before starting the LAN service')
  const workers = [...files.keys()].filter((name) => /^\/assets\/pdf\.worker\.min-.*\.mjs$/.test(name))
  if (workers.length !== 1 || !files.get('/sw.js')?.body.toString('utf8').includes(workers[0].slice(1))) throw new Error('The PDF worker must be built and precached before LAN deployment')
  return files
}

export function createStaticHandler({ files, allowedHosts, subnets }) {
  return (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cache-Control', 'no-store')
    const fail = (status, text) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text) })
      response.end(request.method === 'HEAD' ? undefined : text)
    }
    if (!addressInSubnets(request.socket.remoteAddress, subnets)) return fail(403, 'Client subnet not permitted')
    if (!allowedHosts.has((request.headers.host ?? '').toLowerCase())) return fail(421, 'Host not permitted')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      request.resume()
      return fail(405, 'Read-only app server; personal data stays in each browser')
    }
    const rawPath = (request.url ?? '/').split('?')[0]
    if (rawPath.length > 4096) return fail(414, 'Path too long')
    let pathname
    try { pathname = decodeURIComponent(rawPath) } catch { return fail(400, 'Invalid URL encoding') }
    if (!pathname.startsWith('/') || /[\\:%#]/.test(pathname) || [...pathname].some((character) => character.charCodeAt(0) < 32)
      || pathname.split('/').some((segment) => segment.startsWith('.') || privateSegments.has(segment.toLowerCase()))) return fail(403, 'Path not permitted')
    if (pathname === '/__health') {
      const body = '{"status":"ok","storage":"browser-local","readOnly":true}'
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
      return response.end(request.method === 'HEAD' ? undefined : body)
    }
    const file = files.get(pathname) ?? (shellRoutes.test(pathname) ? files.get('/index.html') : undefined)
    if (!file) return fail(404, 'Not found')
    response.writeHead(200, {
      'Content-Type': file.mime, 'Content-Length': file.body.length,
      'Cache-Control': file.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    response.end(request.method === 'HEAD' ? undefined : file.body)
  }
}

export function createLanServer({ files, allowedHosts, subnets, tls }) {
  if (!tls?.key || !tls?.cert) throw new Error('HTTPS certificate and private key are mandatory for LAN serving')
  const server = createHttpsServer(tls, createStaticHandler({ files, allowedHosts, subnets }))
  server.requestTimeout = 60_000
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000
  return server
}

// Only for automated tests in a fresh loopback browser context. Production CLI
// never exposes an HTTP LAN mode or bypasses browser/TLS certificate validation.
export function createLoopbackTestServer({ files, port }) {
  return createHttpServer(createStaticHandler({ files, allowedHosts: new Set([`127.0.0.1:${port}`]), subnets: [parseSubnet('127.0.0.0/8')] }))
}
