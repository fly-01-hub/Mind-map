import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import * as asar from '@electron/asar'

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter((file) => file && existsSync(file))
const forbidden = /(?:^|\/)(?:release|IndexedDB|Local Storage|\.lan-private|ResearchMind-data-before-[^/]*)(?:\/|$)|(?:^|\/)config\/lan\.local\.json$|\.(?:researchmind|rmstudy|rmpart|pdf|xmind|opml|mm|sqlite3?|db|ldb|pem|key|csr|crt|cer|pfx|p12|jks|keystore|apk|aab)$/i
const rejected = files.filter((file) => forbidden.test(file) || /(?:^|\/)ResearchMind-recovery-records[^/]*\.json$/i.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example'))
if (rejected.length) throw new Error(`Private/generated files must not be published: ${rejected.join(', ')}`)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (JSON.stringify(pkg.build.files) !== JSON.stringify(['dist/**/*', 'electron/**/*', 'package.json'])) throw new Error('Review installer file allowlist before publication')
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) scan(file)
    else if (/\.(?:js|html|json)$/.test(file) && /mockDocuments|test-map|测试导图甲|自动驾驶感知研究|长篇小说世界观|论文阅读清单/.test(readFileSync(file, 'utf8'))) throw new Error(`Seed/test data in production output: ${file}`)
  }
}
if (!existsSync('dist/index.html')) throw new Error('Build the production app before this audit')
scan('dist')
const pdfWorkers = readdirSync('dist/assets').filter((file) => /^pdf\.worker\.min-.*\.mjs$/.test(file))
if (pdfWorkers.length !== 1 || !readFileSync('dist/sw.js', 'utf8').includes(`assets/${pdfWorkers[0]}`)) {
  throw new Error('The PDF.js worker must be precached for first-time offline PDF imports')
}
const archive = 'release/win-unpacked/resources/app.asar'
if (existsSync(archive)) {
  const contents = asar.listPackage(archive).map((file) => file.replaceAll('\\', '/'))
  const unexpected = contents.filter((file) => !/^\/(?:dist|electron|node_modules)(?:\/|$)/.test(file) && file !== '/package.json')
  if (unexpected.length) throw new Error(`Unexpected installer content: ${unexpected.slice(0, 20).join(', ')}`)
  const packagedVersion = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version
  if (packagedVersion !== pkg.version) throw new Error('Installer package version differs from source')
  for (const entry of readdirSync('dist', { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())) {
    const source = path.join(entry.parentPath, entry.name)
    const file = path.relative('dist', source)
    const packaged = asar.extractFile(archive, path.join('dist', file))
    if (!readFileSync(source).equals(packaged)) throw new Error(`Production resource differs in installer: ${file}`)
  }
}
console.log(`Public package audit passed: ${files.length} source files; installer allowlist and production assets contain no seeded maps.`)
