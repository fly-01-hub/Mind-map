import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const repo = 'fly-01-hub/Mind-map-download'
const site = 'https://fly-01-hub.github.io/Mind-map-download/'
const output = path.join(root, 'release', 'promotion')
const mode = process.argv[2] ?? '--inspect'
if (!['--inspect', '--publish'].includes(mode)) throw new Error('Use --inspect or --publish')
fs.mkdirSync(output, { recursive: true })
const credential = execFileSync('git', ['credential', 'fill'], {
  cwd: root, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, stdio: ['pipe', 'pipe', 'pipe'],
})
const token = credential.split('\n').find(line => line.startsWith('password='))?.slice(9).trim()
if (!token) throw new Error('Existing GitHub sign-in is required')
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: ${response.status} ${data.message ?? ''}`)
  return data
}
const [source, target] = await Promise.all([
  api('/repos/fly-01-hub/Mind-map'), api(`/repos/${repo}`),
])
if (source.full_name !== 'fly-01-hub/Mind-map' || source.private !== false || target.full_name !== repo || target.private !== false || !target.permissions?.push) throw new Error('Expected the public source repository and a separate writable public distribution repository')

if (mode === '--inspect') {
  const endpoints = { views: 'traffic/views', referrers: 'traffic/popular/referrers', paths: 'traffic/popular/paths', releases: 'releases?per_page=100' }
  const entries = await Promise.all(Object.entries(endpoints).map(async ([key, endpoint]) => {
    try { return [key, await api(`/repos/${repo}/${endpoint}`)] }
    catch (error) { return [key, { unavailable: true, reason: error.message }] }
  }))
  const data = Object.fromEntries(entries)
  const report = {
    capturedAt: new Date().toISOString(), repository: repo, sourcePrivate: source.private,
    stars: target.stargazers_count, homepage: target.homepage, topics: target.topics,
    views: data.views, referrers: data.referrers, paths: data.paths,
    downloads: Array.isArray(data.releases) ? data.releases.filter(item => !item.draft).map(item => ({ version: item.tag_name, assets: item.assets.map(asset => ({ name: asset.name, downloads: asset.download_count })) })) : data.releases,
    scope: 'Repository views cover the last 14 days and include developer/test visits. Release downloads are cumulative; neither measures active app users.',
  }
  const file = path.join(output, `traffic-${new Date().toISOString().replaceAll(':', '-')}.json`)
  fs.writeFileSync(file, JSON.stringify(report, null, 2))
  const guide = await api(`/repos/${repo}/contents/README.md`)
  fs.writeFileSync(path.join(output, 'public-guide.original.txt'), Buffer.from(guide.content, 'base64'))
  console.log(JSON.stringify(report, null, 2))
  console.log(`Private local snapshot: ${file}`)
  process.exit(0)
}

// Only reviewed public documentation and synthetic demo media may leave this checkout.
const allowlist = ['README.md', 'redme.txt', 'assets/mindmap.png', 'assets/pdf-reading.png', 'assets/demo.gif', 'assets/demo.mp4', 'promotion/share-copy.txt']
const staging = path.join(output, 'public')
for (const file of allowlist) {
  const targetFile = path.join(staging, file)
  if (!fs.existsSync(targetFile)) throw new Error(`Missing reviewed publication file: ${file}`)
  if (/\.(?:md|txt)$/.test(file) && /BEGIN .*PRIVATE KEY|D:\\app\\|test-map|测试导图甲|ResearchMind-data-before-/.test(fs.readFileSync(targetFile, 'utf8'))) throw new Error(`Private content in public document: ${file}`)
}
const current = await api(`/repos/${repo}/git/ref/heads/${target.default_branch}`)
const previous = await api(`/repos/${repo}/git/commits/${current.object.sha}`)
const previousTree = await api(`/repos/${repo}/git/trees/${previous.tree.sha}?recursive=1`)
const existingBlobs = new Set(previousTree.tree.filter(item => item.type === 'blob').map(item => item.sha))
const tree = []
for (const file of allowlist) {
  const bytes = fs.readFileSync(path.join(staging, file))
  if (/\.(?:md|txt)$/.test(file)) tree.push({ path: file, mode: '100644', type: 'blob', content: bytes.toString('utf8') })
  else {
    const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (!existingBlobs.has(sha)) {
      const blob = await api(`/repos/${repo}/git/blobs`, 'POST', { encoding: 'base64', content: bytes.toString('base64') })
      if (blob.sha !== sha) throw new Error(`GitHub media did not verify: ${file}`)
    }
    tree.push({ path: file, mode: '100644', type: 'blob', sha })
  }
}
const nextTree = await api(`/repos/${repo}/git/trees`, 'POST', { base_tree: previous.tree.sha, tree })
if (nextTree.sha !== previous.tree.sha) {
  const commit = await api(`/repos/${repo}/git/commits`, 'POST', { message: 'Show ResearchMind features, real demo and free app entry points', tree: nextTree.sha, parents: [current.object.sha] })
  await api(`/repos/${repo}/git/refs/heads/${target.default_branch}`, 'PATCH', { sha: commit.sha, force: false })
}
await api(`/repos/${repo}`, 'PATCH', {
  description: 'ResearchMind 枝间 · 免费 PDF 阅读、批注与思维导图工具 | Local-first mind maps, PDF reading & notes. Web / Windows.',
  homepage: site,
})
const topics = [...new Set([...(target.topics ?? []), 'mind-map', 'pdf-reader', 'note-taking', 'knowledge-management', 'local-first', 'research', 'pwa', 'windows'])].slice(0, 20)
await api(`/repos/${repo}/topics`, 'PUT', { names: topics })
const verified = await api(`/repos/${repo}`)
console.log(JSON.stringify({ published: true, repository: verified.html_url, homepage: verified.homepage, topics: verified.topics, sourcePrivate: (await api('/repos/fly-01-hub/Mind-map')).private }, null, 2))
