import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

// This script never pushes the source checkout. The public branch is an
// independent Git tree made only from audited build files through GitHub's API.
const root = path.resolve(import.meta.dirname, '..')
const owner = 'fly-01-hub'
const sourceRepo = 'Mind-map'
const downloadRepo = 'Mind-map-download'
const repository = `${owner}/${downloadRepo}`
const siteUrl = `https://${owner}.github.io/${downloadRepo}/`
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const tag = `v${version}`
const installerName = `ResearchMind-Setup-${version}-x64.exe`
const installer = path.join(root, 'release', installerName)
const pagesRoot = path.join(root, 'dist-pages')
const notesPath = path.join(root, 'release', `public-${version}.md`)
const manifestPath = path.join(root, 'release', `public-${version}-manifest.json`)
const mode = process.argv[2] ?? '--publish'
if (!['--prepare', '--publish', '--status'].includes(mode)) throw new Error('Use --prepare, --publish or --status')

function fileList(directory) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort()
}

let token
async function api(endpoint, method = 'GET', body, allowed = []) {
  if (!token) {
    const credential = execFileSync('git', ['credential', 'fill'], {
      cwd: root, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    token = credential.split('\n').find((line) => line.startsWith('password='))?.slice(9).trim()
    if (!token) throw new Error('GitHub sign-in is required; no credential was written to disk')
  }
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`GitHub ${method} ${endpoint}: ${response.status} ${data.message ?? ''}`)
  return { status: response.status, data }
}

// Verify the real remote access boundary before every publication.
const source = (await api(`/repos/${owner}/${sourceRepo}`)).data
const target = (await api(`/repos/${repository}`)).data
if (source.private !== true || target.private !== false || !target.permissions?.push) {
  throw new Error('Expected a private source repository and a writable public download repository')
}

if (mode === '--status') {
  const releases = (await api(`/repos/${repository}/releases?per_page=100`)).data
  const release = { data: releases.find((item) => item.tag_name === tag) ?? {} }
  const pages = await api(`/repos/${repository}/pages`, 'GET', undefined, [404])
  const build = await api(`/repos/${repository}/pages/builds/latest`, 'GET', undefined, [404])
  console.log(JSON.stringify({ sourcePrivate: source.private, release: release.data.html_url, draft: release.data.draft, assets: release.data.assets?.map((asset) => ({ name: asset.name, size: asset.size, url: asset.browser_download_url })), pages: pages.data.html_url, pagesStatus: pages.data.status, buildStatus: build.data.status, buildError: build.data.error?.message }, null, 2))
  process.exit(0)
}

if (!fs.existsSync(installer) || !fs.existsSync(path.join(pagesRoot, 'index.html'))) throw new Error('Build the Windows installer and Pages app before publication')
execFileSync(process.execPath, ['scripts/verify-public-package.mjs'], { cwd: root, stdio: 'inherit' })
const files = fileList(pagesRoot)
const allowedAsset = /\.(?:html|js|mjs|css|json|webmanifest|svg|png|ico|woff2?|ttf)$/
const privateText = /mockDocuments|test-map|测试导图甲|自动驾驶感知研究|ResearchMind-data-before-|BEGIN (?:RSA |EC )?PRIVATE KEY/
for (const file of files) {
  if (!allowedAsset.test(file) || /(?:^|\/)(?:src|node_modules|\.git|\.lan-private)(?:\/|$)/.test(file)) throw new Error(`Unexpected Pages file: ${file}`)
  if (/\.(?:html|js|mjs|css|json|webmanifest|svg)$/.test(file) && privateText.test(fs.readFileSync(path.join(pagesRoot, file), 'utf8'))) throw new Error(`Private/test content in Pages file: ${file}`)
}
const appManifest = JSON.parse(fs.readFileSync(path.join(pagesRoot, 'manifest.webmanifest'), 'utf8'))
if (appManifest.scope !== `/${downloadRepo}/` || appManifest.start_url !== `/${downloadRepo}/#/library`) throw new Error('Pages manifest is not scoped to the public app')
const worker = files.filter((file) => /^assets\/pdf\.worker\.min-.*\.mjs$/.test(file))
if (worker.length !== 1 || !fs.readFileSync(path.join(pagesRoot, 'sw.js'), 'utf8').includes(worker[0])) throw new Error('Pages must precache the PDF worker')
const hash = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex').toUpperCase()
const size = fs.statSync(installer).size
const downloadUrl = `https://github.com/${repository}/releases/download/${tag}/${installerName}`
const notes = `# ResearchMind 枝间 ${version}\n\n免费使用，源码仓库保持私有。\n\n- [在线使用网页版](${siteUrl})\n- [下载 Windows x64 安装包](${downloadUrl})\n- PDF 改为上下连续滚动阅读，独立阅读与导图分栏均支持；页码随滚动更新，并恢复页内阅读位置。\n- 长 PDF 仅渲染视口附近页面，保留搜索、页码跳转、缩放及文字/区域批注。\n- 修复批注重复定位导致页面被拉回的问题，连续标注时保持阅读位置。\n- PDF 文献节点单击选中，双击打开左 PDF / 右导图分栏。\n- 选中节点后只显示一组加减按钮，悬停不显示。\n\n安装包：${installerName}\n大小：${size} 字节\nSHA-256：${hash}\n\n资料保存在各自设备或浏览器中，不会上传到 GitHub，不会自动跨设备同步。升级前请创建完整备份并关闭旧版；正常升级保留已有资料。网页版与桌面版资料空间独立，可用完整 .researchmind 备份迁移。安装包未提供可信商业代码签名，若系统阻止安装请停止并反馈，不关闭安全保护。\n\n仅公开运行所需的构建资源；不公开原始工程、开发历史、个人资料或凭据。不承诺程序无法被逆向分析。\n`
fs.writeFileSync(notesPath, notes)
fs.writeFileSync(manifestPath, JSON.stringify({ version, sourcePrivate: true, repository, siteUrl, installerName, size, sha256: hash, pagesFiles: files }, null, 2))
console.log(JSON.stringify({ ready: true, version, installerName, size, sha256: hash, pagesFiles: files.length, siteUrl }))
if (mode === '--prepare') process.exit(0)

const releases = (await api(`/repos/${repository}/releases?per_page=100`)).data
let release = releases.find((item) => item.tag_name === tag)
if (!release) {
  release = (await api(`/repos/${repository}/releases`, 'POST', { tag_name: tag, target_commitish: target.default_branch, name: `ResearchMind 枝间 ${version} · Windows 与网页版`, body: notes, draft: true, prerelease: false })).data
} else if (!release.draft) {
  throw new Error(`${tag} is already published; choose a new version instead of replacing a public installer`)
}
const previousInstaller = release.assets.find((asset) => asset.name === installerName)
if (previousInstaller) {
  if (previousInstaller.digest !== `sha256:${hash.toLowerCase()}` || previousInstaller.size !== size) throw new Error('A different installer is already present in this draft; refusing to replace it')
} else {
  console.log(`Uploading ${installerName} (${size} bytes) to draft release`)
  const uploadUrl = release.upload_url.replace(/\{.*$/, '') + `?name=${encodeURIComponent(installerName)}`
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
    body: fs.createReadStream(installer), duplex: 'half',
  })
  const uploaded = await upload.json()
  if (!upload.ok || uploaded.size !== size || uploaded.state !== 'uploaded' || uploaded.digest !== `sha256:${hash.toLowerCase()}`) throw new Error(`Installer upload did not verify: ${upload.status} ${uploaded.message ?? ''}`)
}

console.log('Publishing audited static assets to the independent gh-pages branch')
const branch = await api(`/repos/${repository}/git/ref/heads/gh-pages`, 'GET', undefined, [404])
const previousSha = branch.data.object?.sha
let previousTreeSha
const existingBlobs = new Set()
if (previousSha) {
  const previousCommit = (await api(`/repos/${repository}/git/commits/${previousSha}`)).data
  previousTreeSha = previousCommit.tree.sha
  const previousTree = (await api(`/repos/${repository}/git/trees/${previousCommit.tree.sha}?recursive=1`)).data
  for (const item of previousTree.tree) if (item.type === 'blob') existingBlobs.add(item.sha)
}
const treeEntries = [{ path: '.nojekyll', mode: '100644', type: 'blob', content: '' }]
const binaryFiles = []
for (const file of files) {
  const bytes = fs.readFileSync(path.join(pagesRoot, file))
  if (/\.(?:png|ico|woff2?|ttf)$/.test(file)) {
    const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    treeEntries.push({ path: file, mode: '100644', type: 'blob', sha })
    if (!existingBlobs.has(sha)) binaryFiles.push({ file, bytes, sha })
  } else treeEntries.push({ path: file, mode: '100644', type: 'blob', content: bytes.toString('utf8') })
}
for (let start = 0; start < binaryFiles.length; start += 3) {
  await Promise.all(binaryFiles.slice(start, start + 3).map(async ({ file, bytes, sha }) => {
    const result = (await api(`/repos/${repository}/git/blobs`, 'POST', { content: bytes.toString('base64'), encoding: 'base64' })).data
    if (result.sha !== sha) throw new Error(`GitHub blob did not verify: ${file}`)
  }))
}
const publicTree = (await api(`/repos/${repository}/git/trees`, 'POST', { tree: treeEntries })).data
if (publicTree.sha !== previousTreeSha) {
  const publicCommit = (await api(`/repos/${repository}/git/commits`, 'POST', { message: `Publish compiled ResearchMind ${version}`, tree: publicTree.sha, parents: previousSha ? [previousSha] : [] })).data
  if (previousSha) await api(`/repos/${repository}/git/refs/heads/gh-pages`, 'PATCH', { sha: publicCommit.sha, force: false })
  else await api(`/repos/${repository}/git/refs`, 'POST', { ref: 'refs/heads/gh-pages', sha: publicCommit.sha })
}
const pages = await api(`/repos/${repository}/pages`, 'GET', undefined, [404])
if (pages.status === 404) {
  // GitHub may automatically enable Pages when the first gh-pages branch arrives.
  const created = await api(`/repos/${repository}/pages`, 'POST', { build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } }, [409])
  if (created.status === 409) await api(`/repos/${repository}/pages`, 'PUT', { build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } })
} else if (pages.data.source?.branch !== 'gh-pages' || pages.data.source?.path !== '/') {
  await api(`/repos/${repository}/pages`, 'PUT', { build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } })
}

const currentReadme = (await api(`/repos/${repository}/contents/README.md`)).data
let readme = Buffer.from(currentReadme.content, 'base64').toString('utf8')
readme = readme
  .replace(/ResearchMind-Setup-\d+\.\d+\.\d+-x64\.exe/g, installerName)
  .replace(/releases\/download\/v\d+\.\d+\.\d+\//g, `releases/download/${tag}/`)
  .replace(/当前版本：\*\*\d+\.\d+\.\d+\*\*/, `当前版本：**${version}**`)
  .replace(/安装包大小：[0-9,]+ 字节/, `安装包大小：${size.toLocaleString('en-US')} 字节`)
  .replace(/(安装包大小：[\s\S]*?SHA-256：[\s\S]*?)[A-F0-9]{64}/, (_match, prefix) => prefix + hash)
readme = readme.replace('仅提供使用说明及 Windows EXE 安装包', '提供使用说明、Windows EXE 安装包和网页版构建资源（gh-pages 分支）')
readme = readme.replace('在思维导图中双击节点编辑文字，选中节点后按', '在思维导图中双击普通节点编辑文字；PDF 文献节点单击选中、双击打开分栏。选中节点后显示加减按钮，按')
if (!readme.includes('连续滚动阅读')) readme = readme.replace('## 保存、完整备份与恢复', 'PDF 支持上下连续滚动阅读，独立阅读与导图分栏均可使用。顶部页码跟随滚动，仍可输入页码或用上一页/下一页跳转；关闭后恢复页码和页内位置。长文献只渲染视口附近的页面。\n\n## 保存、完整备份与恢复')
readme = readme.replace('公开仓库的文件和提交历史只有说明文档', '公开仓库的 main 分支提供说明文档，gh-pages 分支提供网页构建资源；均不包含原始开发工程或私有源码历史')
readme = readme.replace('后续公开更新仍仅上传经核验的安装包和说明', '后续公开更新仅上传经核验的安装包、说明及网页构建资源')
if (!readme.includes(siteUrl)) readme = readme.replace('## 下载安装', `## 在线使用（免费）\n\n[打开网页版](${siteUrl})。无需安装或启动本机服务器，支持浏览器中的 PWA 安装；首次在线加载后可离线使用已缓存功能。资料保存在各自浏览器，浏览器清理数据可能导致资料丢失，请定期导出完整备份。网页版与桌面版本的资料不会自动同步。\n\n## 下载安装`)
if (readme !== Buffer.from(currentReadme.content, 'base64').toString('utf8')) await api(`/repos/${repository}/contents/README.md`, 'PUT', { message: `Document ResearchMind ${version} downloads and free web app`, content: Buffer.from(readme).toString('base64'), sha: currentReadme.sha, branch: target.default_branch })
const publicGuide = await api(`/repos/${repository}/contents/redme.txt`, 'GET', undefined, [404])
if (publicGuide.status === 200 && Buffer.from(publicGuide.data.content, 'base64').toString('utf8') !== readme) await api(`/repos/${repository}/contents/redme.txt`, 'PUT', { message: `Update public usage guide for ${version}`, content: Buffer.from(readme).toString('base64'), sha: publicGuide.data.sha, branch: target.default_branch })
const publicMain = (await api(`/repos/${repository}/git/ref/heads/${target.default_branch}`)).data.object.sha
release = (await api(`/repos/${repository}/releases/${release.id}`, 'PATCH', { draft: false, body: notes, target_commitish: publicMain, make_latest: 'true' })).data
// The repository commit may be visible before Pages finishes serving it.
// Wait for the exact entry page, keeping later public browser checks reproducible.
const expectedIndex = fs.readFileSync(path.join(pagesRoot, 'index.html'))
let servingCurrentBuild = false
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(`${siteUrl}index.html`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (response.ok && Buffer.from(await response.arrayBuffer()).equals(expectedIndex)) {
      servingCurrentBuild = true
      break
    }
  } catch { /* A pending Pages deployment may briefly be unavailable. */ }
  if (attempt % 4 === 0) console.log('Waiting for GitHub Pages to serve the new build')
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}
if (!servingCurrentBuild) throw new Error('Release is published; Pages has not served the current build yet. Check --status before retrying browser verification')
console.log(JSON.stringify({ published: true, releaseUrl: release.html_url, downloadUrl, siteUrl, sourcePrivate: true, sha256: hash }, null, 2))
