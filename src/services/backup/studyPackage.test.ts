import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { importStudyPackage } from './studyPackage'

const bytes = new TextEncoder().encode('%PDF-1.7\nresearch package test\n%%EOF')
const digest = async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
async function study(corrupt = false, badLink = false) {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ format: 'researchmind-study', version: 1, id: 'test-package', title: '球面调研',
    root: { id: 'root', title: '球面调研', note: '调研笔记', children: [{ id: 'paper-node', title: '论文', children: [] }] },
    papers: [{ key: 'p1', title: 'Test paper', file: 'pdfs/test.pdf', bytes: bytes.length, pageCount: 1, sha256: await digest() }],
    links: [{ nodeId: badLink ? 'missing-node' : 'paper-node', paperKey: 'p1' }] }))
  zip.file('pdfs/test.pdf', corrupt ? new TextEncoder().encode('corrupt') : bytes)
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })])
}
beforeEach(async () => {
  await appDatabase.open()
  await appDatabase.transaction('rw', appDatabase.tables, () => Promise.all(appDatabase.tables.map(table => table.clear())))
  const root = createNode('原有资料')
  await appDatabase.documents.add({ id: 'existing', title: root.title, root, version: 3, isFavorite: true, createdAt: root.createdAt, updatedAt: root.updatedAt })
})
afterEach(() => vi.restoreAllMocks())

it('adds a new linked PDF document, preserves existing records and does not duplicate an imported package', async () => {
  const before = await appDatabase.documents.get('existing')
  const file = await study()
  const result = await importStudyPackage(file)
  expect(await appDatabase.documents.get('existing')).toEqual(before)
  expect(await appDatabase.documents.count()).toBe(2)
  const document = await appDatabase.documents.get(result.documentId)
  const [relation] = await appDatabase.nodePaperRelations.toArray()
  expect(relation.nodeId).toBe(document?.root.children[0].id)
  expect(relation.nodeId).not.toBe('paper-node')
  expect(new Uint8Array(await (await appDatabase.paperFiles.get(relation.paperId))!.blob.arrayBuffer())).toEqual(bytes)
  expect(await importStudyPackage(file)).toMatchObject({ documentId: result.documentId, alreadyImported: true })
  expect(await appDatabase.documents.count()).toBe(2)
  expect(await appDatabase.papers.count()).toBe(1)
  expect(await appDatabase.nodePaperRelations.count()).toBe(1)
})

it('rejects a corrupt PDF or missing node before writing anything', async () => {
  await expect(importStudyPackage(await study(true))).rejects.toThrow('PDF 完整性校验失败')
  await expect(importStudyPackage(await study(false, true))).rejects.toThrow('论文节点关联无效')
  expect(await appDatabase.documents.count()).toBe(1)
  expect(await appDatabase.papers.count()).toBe(0)
  expect(await appDatabase.nodePaperRelations.count()).toBe(0)
})

it('rolls back a mid-import database failure and preserves the original document', async () => {
  const before = await appDatabase.documents.get('existing')
  vi.spyOn(appDatabase.paperFiles, 'add').mockRejectedValueOnce(new Error('simulated storage failure'))
  await expect(importStudyPackage(await study())).rejects.toThrow('simulated storage failure')
  expect(await appDatabase.documents.get('existing')).toEqual(before)
  expect(await appDatabase.documents.count()).toBe(1)
  expect(await appDatabase.papers.count()).toBe(0)
  expect(await appDatabase.meta.count()).toBe(0)
})
