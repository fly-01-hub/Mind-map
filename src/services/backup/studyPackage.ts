import JSZip from 'jszip'
import { appDatabase } from '../../db/appDatabase'
import type { MindMapDocument, NodeData } from '../../types/mindmap'
import type { Paper } from '../../types/paper'
import { createNode } from '../../utils/tree'
import { uniqueDocumentName } from '../../utils/wikiLinks'

interface StudyPaper { key: string; title: string; file: string; sha256: string; pageCount: number; bytes: number }
interface StudyLink { nodeId: string; paperKey: string }
interface StudyManifest { format: 'researchmind-study'; version: 1; id: string; title: string; root: unknown; papers: StudyPaper[]; links: StudyLink[] }

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum

// Only embedded raster diagrams are accepted; packages never supply active HTML,
// remote images, or replacement DB tables. Limit decoded size as well as bytes.
function readDiagram(input: unknown, budget: { bytes: number }): NonNullable<NodeData['image']> {
  if (!record(input) || !text(input.url, 6_000_000) || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.url)
    || !Number.isInteger(input.width) || !Number.isInteger(input.height)
    || Number(input.width) < 1 || Number(input.width) > 960 || Number(input.height) < 1 || Number(input.height) > 1600) throw new Error('文献资料包的图解无效：仅支持限定大小的内嵌 PNG。')
  let bytes: string
  try { bytes = atob(input.url.slice('data:image/png;base64,'.length)) } catch { throw new Error('文献资料包的图解编码无效。') }
  budget.bytes += bytes.length
  const uint32 = (offset: number) => ((bytes.charCodeAt(offset) * 0x1000000) + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3))
  const width = uint32(16), height = uint32(20)
  if (bytes.length < 45 || bytes.length > 4 * 1024 * 1024 || budget.bytes > 32 * 1024 * 1024
    || bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || uint32(8) !== 13 || bytes.slice(12, 16) !== 'IHDR'
    || bytes.slice(-8, -4) !== 'IEND' || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 8_000_000) throw new Error('文献资料包的图解大小或 PNG 结构无效。')
  return { url: input.url, width: Number(input.width), height: Number(input.height) }
}

function readTree(input: unknown, ids = new Map<string, string>(), depth = 0, images = { bytes: 0 }): { root: NodeData; ids: Map<string, string> } {
  if (depth > 50 || ids.size >= 20_000 || !record(input) || !text(input.id, 200) || !input.id || ids.has(input.id)
    || !text(input.title, 10_000) || !Array.isArray(input.children) || !text(input.note ?? '', 500_000)) throw new Error('文献资料包的节点结构无效。')
  const root = createNode(input.title)
  ids.set(input.id, root.id)
  root.note = String(input.note ?? '')
  if (input.image !== undefined) root.image = readDiagram(input.image, images)
  if (input.hyperlink !== undefined) {
    if (!text(input.hyperlink, 4000) || !/^https?:\/\//i.test(input.hyperlink)) throw new Error('文献资料包含无效来源链接。')
    root.hyperlink = input.hyperlink
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some(tag => !text(tag, 200))) throw new Error('文献资料包标签无效。')
    root.tags = input.tags
  }
  root.collapsed = input.collapsed === true
  root.children = input.children.map((child, index) => ({ ...readTree(child, ids, depth + 1, images).root, order: index }))
  return { root, ids }
}

export async function importStudyPackage(file: Blob) {
  if (file.size > 512 * 1024 * 1024) throw new Error('文献资料包超过 512 MB，请拆分后导入。')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('这不是有效的文献资料包。')
  let value: unknown
  try { value = JSON.parse(await manifestEntry.async('string')) } catch { throw new Error('文献资料包清单无法读取。') }
  if (!record(value) || value.format !== 'researchmind-study' || value.version !== 1 || !text(value.id, 200) || !value.id
    || !text(value.title, 1000) || !value.title.trim() || !Array.isArray(value.papers) || value.papers.length > 1000 || !Array.isArray(value.links)) throw new Error('文献资料包格式或版本不受支持。')
  const manifest = value as unknown as StudyManifest
  const { root, ids } = readTree(manifest.root)
  const keys = new Set<string>()
  const paths = new Set<string>()
  const verified: Array<{ entry: StudyPaper; blob: Blob }> = []
  let totalBytes = 0
  for (const entry of manifest.papers) {
    if (!record(entry) || !text(entry.key, 200) || !entry.key || keys.has(entry.key) || !text(entry.title, 10_000)
      || !text(entry.file, 300) || !/^pdfs\/[A-Za-z0-9_.-]+\.pdf$/i.test(entry.file) || paths.has(entry.file)
      || !/^[a-f0-9]{64}$/i.test(String(entry.sha256)) || !Number.isInteger(entry.pageCount) || entry.pageCount < 1
      || !Number.isInteger(entry.bytes) || entry.bytes < 5 || entry.bytes > 128 * 1024 * 1024) throw new Error('文献资料包的 PDF 清单无效。')
    totalBytes += entry.bytes
    if (totalBytes > 512 * 1024 * 1024) throw new Error('解压后的 PDF 总大小超过 512 MB。')
    keys.add(entry.key)
    paths.add(entry.file)
    const pdf = zip.file(entry.file)
    if (!pdf) throw new Error(`资料包缺少 PDF：${entry.title}`)
    const bytes = new Uint8Array(await pdf.async('uint8array'))
    const header = new TextDecoder().decode(bytes.subarray(0, 1024))
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
    if (bytes.length !== entry.bytes || !header.includes('%PDF-') || digest !== entry.sha256.toLowerCase()) throw new Error(`PDF 完整性校验失败：${entry.title}`)
    verified.push({ entry, blob: new Blob([bytes], { type: 'application/pdf' }) })
  }
  const relationKeys = new Set<string>()
  for (const link of manifest.links) {
    if (!record(link) || typeof link.nodeId !== 'string' || typeof link.paperKey !== 'string' || !ids.has(link.nodeId) || !keys.has(link.paperKey)
      || relationKeys.has(`${link.nodeId}\0${link.paperKey}`)) throw new Error('文献资料包的论文节点关联无效。')
    relationKeys.add(`${link.nodeId}\0${link.paperKey}`)
  }
  const marker = `study-import:${manifest.id}`
  return appDatabase.transaction('rw', [appDatabase.documents, appDatabase.papers, appDatabase.paperFiles, appDatabase.nodePaperRelations, appDatabase.meta], async () => {
    const previous = await appDatabase.meta.get(marker)
    if (previous && await appDatabase.documents.get(previous.value)) return { documentId: previous.value, paperCount: verified.length, alreadyImported: true }
    const now = new Date().toISOString()
    const title = uniqueDocumentName(await appDatabase.documents.toArray(), manifest.title)
    root.title = title
    const document: MindMapDocument = { id: crypto.randomUUID(), title, root, version: 1, isFavorite: false, createdAt: now, updatedAt: now }
    await appDatabase.documents.add(document)
    const paperIds = new Map<string, string>()
    for (const { entry, blob } of verified) {
      const existing = await appDatabase.papers.where('checksum').equals(entry.sha256.toLowerCase()).filter(paper => !paper.deletedAt).first()
      if (existing) {
        paperIds.set(entry.key, existing.id)
        if (!await appDatabase.paperFiles.get(existing.id)) await appDatabase.paperFiles.add({ paperId: existing.id, blob, cachedAt: now })
      } else {
        const id = crypto.randomUUID()
        const paper: Paper = { id, userId: `study:${manifest.id}`, title: entry.title, fileName: entry.file.slice(5), filePath: `local://${id}`,
          checksum: entry.sha256.toLowerCase(), fileSize: blob.size, pageCount: entry.pageCount, createdAt: now, updatedAt: now }
        await appDatabase.papers.add(paper)
        await appDatabase.paperFiles.add({ paperId: id, blob, cachedAt: now })
        paperIds.set(entry.key, id)
      }
    }
    const uniqueRelations = new Set<string>()
    for (const link of manifest.links) {
      const nodeId = ids.get(link.nodeId)!
      const paperId = paperIds.get(link.paperKey)!
      const key = `${nodeId}\0${paperId}`
      if (uniqueRelations.has(key)) continue
      uniqueRelations.add(key)
      await appDatabase.nodePaperRelations.add({ id: crypto.randomUUID(), documentId: document.id, nodeId, paperId, createdAt: now })
    }
    if (previous) await appDatabase.meta.put({ key: marker, value: document.id })
    else await appDatabase.meta.add({ key: marker, value: document.id })
    return { documentId: document.id, paperCount: verified.length, alreadyImported: false }
  })
}
