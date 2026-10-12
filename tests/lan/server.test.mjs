import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { addressInSubnets, createLanServer, createStaticHandler, loadAppSnapshot, loadTls, parseSubnet, validateConfig } from '../../scripts/lan/static-server.mjs'

let sandbox, dist, keyFile, certificateFile, commonNameOnlyCertificateFile, files
const config = () => ({ listenAddress: '127.0.0.1', port: 18443, publicOrigin: 'https://127.0.0.1:18443', allowedClientSubnets: ['127.0.0.0/8'], tls: { certificateFile, privateKeyFile: keyFile } })

before(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'researchmind-lan-tests-'))
  dist = path.join(sandbox, 'dist')
  const privateDirectory = path.join(sandbox, 'private')
  mkdirSync(path.join(dist, 'assets'), { recursive: true })
  mkdirSync(privateDirectory)
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Compiled app fixture</title>')
  writeFileSync(path.join(dist, 'sw.js'), '/* assets/pdf.worker.min-TEST1234.mjs */')
  writeFileSync(path.join(dist, 'assets', 'pdf.worker.min-TEST1234.mjs'), 'export const fixture = true')
  writeFileSync(path.join(dist, 'assets', 'app-TEST1234.js'), '/* production asset fixture */')
  writeFileSync(path.join(dist, 'server-key.pem'), 'PRIVATE MATERIAL MUST NOT BE SERVED')
  writeFileSync(path.join(dist, 'assets', 'backup-TEST1234.researchmind'), 'PRIVATE BACKUP MUST NOT BE SERVED')
  writeFileSync(path.join(dist, 'assets', 'paper-TEST1234.pdf'), 'PRIVATE PDF MUST NOT BE SERVED')
  writeFileSync(path.join(dist, 'assets', 'app-TEST1234.js.map'), 'SOURCE MAP MUST NOT BE SERVED')
  files = loadAppSnapshot(dist)
  keyFile = path.join(privateDirectory, 'test-key.pem')
  certificateFile = path.join(privateDirectory, 'test-cert.pem')
  const gitOpenSsl = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe')
  const openssl = process.env.RESEARCHMIND_OPENSSL ?? (process.platform === 'win32' && existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl')
  // Trust is scoped to the test HTTPS client below, never installed in Windows
  // or a browser. Certificate verification stays enabled.
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:FALSE',
    '-keyout', keyFile, '-out', certificateFile], { stdio: ['ignore', 'ignore', 'pipe'] })
  commonNameOnlyCertificateFile = path.join(privateDirectory, 'test-no-san-cert.pem')
  execFileSync(openssl, ['req', '-x509', '-key', keyFile, '-days', '2', '-subj', '/CN=localhost',
    '-addext', 'basicConstraints=critical,CA:FALSE', '-out', commonNameOnlyCertificateFile],
  { stdio: ['ignore', 'ignore', 'pipe'] })
})

after(() => {
  if (path.dirname(sandbox) !== path.resolve(tmpdir()) || !path.basename(sandbox).startsWith('researchmind-lan-tests-')) throw new Error('Unsafe temporary test cleanup target')
  rmSync(sandbox, { recursive: true, force: true })
})

function request(base, route, { method = 'GET', host, ca } = {}) {
  const target = new URL(base)
  return new Promise((resolve, reject) => {
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest
    const connection = send({ protocol: target.protocol, hostname: target.hostname, port: target.port, path: route, method,
      headers: host ? { Host: host } : {}, ca }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }))
    })
    connection.once('error', reject)
    connection.end()
  })
}

async function withServer(run, tls) {
  const allowedHosts = new Set()
  const parameters = { files, allowedHosts, subnets: [parseSubnet('127.0.0.0/8')] }
  const server = tls ? createLanServer({ ...parameters, tls }) : createServer(createStaticHandler(parameters))
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  allowedHosts.add(`127.0.0.1:${port}`)
  try { await run(`${tls ? 'https' : 'http'}://127.0.0.1:${port}`) }
  finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }) }
}

test('configuration requires HTTPS, one private interface and private client subnets', () => {
  assert.equal(validateConfig(config()).publicOrigin, 'https://127.0.0.1:18443')
  for (const overrides of [
    { publicOrigin: 'http://127.0.0.1:18443' }, { listenAddress: '0.0.0.0' }, { listenAddress: '8.8.8.8' },
    { allowedClientSubnets: ['0.0.0.0/0'] }, { allowedClientSubnets: [] }, { allowedClientSubnets: ['8.8.8.0/24'] },
    { publicOrigin: 'https://127.0.0.1:9999' }, { publicOrigin: 'https://user:secret@127.0.0.1:18443' },
  ]) assert.throws(() => validateConfig({ ...config(), ...overrides }))
})

test('subnet allowlist rejects other LANs, public clients and invalid IPv4 CIDRs', () => {
  const subnets = [parseSubnet('192.168.1.0/24')]
  assert.equal(addressInSubnets('192.168.1.19', subnets), true)
  assert.equal(addressInSubnets('::ffff:192.168.1.23', subnets), true)
  assert.equal(addressInSubnets('192.168.2.19', subnets), false)
  assert.equal(addressInSubnets('8.8.8.8', subnets), false)
  for (const invalid of ['192.168.1.0/33', '192.168.1.0/0', '192.168.1.0/-1', '192.168.1.0/x', 'invalid/24', '192.0.0.0/8']) assert.throws(() => parseSubnet(invalid))
})

test('snapshot excludes private keys, PDFs, backups and source maps', () => {
  assert.equal(files.size, 4)
  assert.equal(files.has('/server-key.pem'), false)
  assert.equal(files.has('/assets/backup-TEST1234.researchmind'), false)
  assert.equal(files.has('/assets/paper-TEST1234.pdf'), false)
  assert.equal(files.has('/assets/app-TEST1234.js.map'), false)
})

test('PDF worker must be precached before deployment', () => {
  const incomplete = path.join(sandbox, 'incomplete')
  mkdirSync(incomplete)
  writeFileSync(path.join(incomplete, 'index.html'), '<html></html>')
  assert.throws(() => loadAppSnapshot(incomplete), /PDF worker/)
})

test('deep links, PDF worker MIME, HEAD and cache controls preserve the PWA', async () => {
  await withServer(async (base) => {
    for (const route of ['/library', '/map/fixture-document', '/paper/fixture-paper', '/annotations']) {
      const response = await request(base, route)
      assert.equal(response.status, 200)
      assert.match(response.headers['content-type'], /text\/html/)
      assert.equal(response.headers['cache-control'], 'no-cache')
    }
    const worker = await request(base, '/assets/pdf.worker.min-TEST1234.mjs')
    assert.equal(worker.status, 200)
    assert.match(worker.headers['content-type'], /javascript/)
    assert.match(worker.headers['cache-control'], /immutable/)
    assert.equal(worker.headers['x-content-type-options'], 'nosniff')
    assert.equal((await request(base, '/sw.js')).headers['cache-control'], 'no-cache')
    const head = await request(base, '/assets/pdf.worker.min-TEST1234.mjs', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.body, '')
    assert.ok(Number(head.headers['content-length']) > 0)
    assert.equal((await request(base, '/assets/missing-worker.mjs')).status, 404)
    assert.equal((await request(base, '/__health')).body, '{"status":"ok","storage":"browser-local","readOnly":true}')
  })
})

test('read-only service rejects all write methods and cannot store user data', async () => {
  await withServer(async (base) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = await request(base, '/library', { method })
      assert.equal(response.status, 405)
      assert.equal(response.headers.allow, 'GET, HEAD')
    }
  })
})

test('private paths, traversal and invalid encodings never expose the project or keys', async () => {
  await withServer(async (base) => {
    for (const route of ['/../private/test-key.pem', '/%2e%2e/private/test-key.pem', '/%252e%252e/private/test-key.pem',
      '/assets/%5c..%5cprivate/test-key.pem', '/.git/config', '/src/App.tsx', '/config/lan.local.json', '/release/app.asar',
      '/%00private-key', '/assets/backup-TEST1234.researchmind', '/server-key.pem', '/assets/app-TEST1234.js.map']) {
      const response = await request(base, route)
      assert.ok([400, 403, 404].includes(response.status), `${route}: ${response.status}`)
      assert.doesNotMatch(response.body, /PRIVATE MATERIAL|PRIVATE BACKUP|SOURCE MAP/)
    }
    assert.equal((await request(base, '/%invalid')).status, 400)
    assert.equal((await request(base, '/library', { host: 'unapproved.example' })).status, 421)
  })
})

test('HTTPS certificate is validated and a TLS client verifies the supplied trust anchor', async () => {
  const validated = validateConfig(config())
  const tls = loadTls(validated, sandbox, dist)
  assert.equal(tls.options.minVersion, 'TLSv1.2')
  await withServer(async (base) => {
    await assert.rejects(request(base, '/__health'), /self.signed|certificate/i)
    const response = await request(base, '/__health', { ca: readFileSync(certificateFile) })
    assert.equal(response.status, 200)
  }, tls.options)
  assert.throws(() => loadTls({ ...validated, publicOrigin: 'https://wrong.example:18443' }, sandbox, dist), /SAN/)
  assert.throws(() => loadTls({ ...validated, publicOrigin: 'https://localhost:18443',
    tls: { ...validated.tls, certificateFile: commonNameOnlyCertificateFile } }, sandbox, dist), /SAN/)
  assert.throws(() => createLanServer({ files, allowedHosts: new Set(), subnets: [] }), /mandatory/)
  assert.throws(() => loadTls({ ...validated, tls: { ...validated.tls, privateKeyFile: path.join(dist, 'server-key.pem') } }, sandbox, dist), /outside/)
})
