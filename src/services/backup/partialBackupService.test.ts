import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { createLocalBackup, restoreLocalBackup } from './localBackupService'
import { createPartialBackup, importSelectedMaps, prepareMapImport } from './partialBackupService'

const now = '2026-10-16T00:00:00.000Z'
beforeEach(async () => {
  await appDatabase.open()
  await appDatabase.transaction('rw', appDatabase.tables, () => Promise.all(appDatabase.tables.map(t => t.clear())))
  const a = { ...createNode('甲'), note: '参阅 [[乙]]', children: [{ ...createNode('关联文献'), id: 'paper-node',
    attachments: [{ id: 'attachment', fileName: 'note.txt', mimeType: 'text/plain', size: 4, storagePath: 'local://attachment', createdAt: now }] }] }
  const b = createNode('乙'), c = createNode('未选择')
  await appDatabase.documents.bulkAdd([
    { id: 'a', title: '甲', root: a, folderId: 'child-folder', version: 2, isFavorite: true, createdAt: now, updatedAt: now,
      arrows: [{ id: 'arrow', from: a.id, to: 'paper-node', label: '关系' }],
      summaries: [{ id: 'summary', label: '概要', parent: a.id, start: 0, end: 0, nodeIds: ['paper-node'] }] },
    { id: 'b', title: '乙', root: b, version: 1, isFavorite: false, createdAt: now, updatedAt: now },
    { id: 'c', title: '未选择', root: c, version: 1, isFavorite: false, createdAt: now, updatedAt: now },
  ])
  await appDatabase.folders.bulkAdd([
    { id: 'parent-folder', name: '研究', order: 0, createdAt: now, updatedAt: now },
    { id: 'child-folder', name: '文献', parentId: 'parent-folder', order: 0, createdAt: now, updatedAt: now },
    { id: 'unrelated-folder', name: '不导出', order: 1, createdAt: now, updatedAt: now },
  ])
  await appDatabase.versions.add({ id: 'version', documentId: 'a', root: a, title: '甲', version: 1, createdAt: now, reason: 'important' })
  await appDatabase.attachmentBlobs.add({ id: 'attachment', documentId: 'a', nodeId: 'paper-node', blob: new Blob(['note']), createdAt: now })
  await appDatabase.papers.add({ id: 'paper', userId: 'local', title: '共享论文', fileName: 'test.pdf', filePath: 'local://paper', fileSize: 4, pageCount: 1, checksum: 'sample-checksum', createdAt: now, updatedAt: now })
  await appDatabase.paperFiles.add({ paperId: 'paper', blob: new Blob(['%PDF-test']), cachedAt: now })
  await appDatabase.paperReadingStates.add({ paperId: 'paper', pageNumber: 1, scrollOffset: .2, scale: 1.2, updatedAt: now })
  await appDatabase.paperAnnotations.add({ id: 'annotation', paperId: 'paper', userId: 'local', selectedText: '引用', content: '批注', annotationType: 'note', pageNumber: 1,
    positionData: { version: 1, rects: [], pageWidth: 600, pageHeight: 800, rotation: 0 }, createdAt: now, updatedAt: now })
  await appDatabase.nodePaperRelations.bulkAdd([
    { id: 'link-a', documentId: 'a', nodeId: 'paper-node', paperId: 'paper', createdAt: now },
    { id: 'link-b', documentId: 'b', nodeId: b.id, paperId: 'paper', createdAt: now },
  ])
  await appDatabase.annotationNodeRelations.add({ id: 'annotation-link', documentId: 'a', nodeId: 'paper-node', annotationId: 'annotation', createdAt: now })
  await appDatabase.meta.add({ key: 'unrelated-setting', value: 'must-not-export' })
})
afterEach(() => vi.restoreAllMocks())
const current = async () => ({ documents: await appDatabase.documents.toArray(), folders: await appDatabase.folders.toArray() })

it('exports only selected documents and their dependent records, never unrelated settings or maps', async () => {
  const file = await createPartialBackup(['a'], await current())
  expect(file.fileName).toMatch(/\.rmpart$/)
  const { rows } = await prepareMapImport(file.blob)
  expect(rows.documents.map(d => d.id)).toEqual(['a'])
  expect(rows.folders.map(f => f.id).sort()).toEqual(['child-folder', 'parent-folder'])
  expect(rows.nodePaperRelations.map(r => r.id)).toEqual(['link-a'])
  expect(rows.versions).toHaveLength(1)
  expect(await rows.attachmentBlobs[0].blob.text()).toBe('note')
  expect(await rows.paperFiles[0].blob.text()).toBe('%PDF-test')
  expect(rows.paperAnnotations[0].content).toBe('批注')
  expect(rows.paperReadingStates[0].scrollOffset).toBe(.2)
  expect(rows.meta).toEqual([])
  await expect(restoreLocalBackup(file.blob)).rejects.toThrow('格式或版本不受支持')
})

it('imports copies with remapped visual, attachment, history and annotation references; rewrites links between selected maps', async () => {
  const before = await current()
  const file = await createPartialBackup(['a', 'b'], before)
  const result = await importSelectedMaps(await prepareMapImport(file.blob), ['a', 'b'])
  expect(result.documentCount).toBe(2)
  for (const d of before.documents) expect(await appDatabase.documents.get(d.id)).toEqual(d)
  const documents = await appDatabase.documents.toArray()
  const a = documents.find(d => d.title === '甲 (2)')!, b = documents.find(d => d.title === '乙 (2)')!
  expect(a.id).not.toBe('a'); expect(b.id).not.toBe('b')
  expect(a.root.note).toBe('参阅 [[乙 (2)]]')
  expect(a.arrows?.[0].from).toBe(a.root.id)
  expect(a.arrows?.[0].to).toBe(a.root.children[0].id)
  expect(a.summaries?.[0].nodeIds).toEqual([a.root.children[0].id])
  const attachment = a.root.children[0].attachments[0]
  expect(attachment.id).not.toBe('attachment')
  expect(await (await appDatabase.attachmentBlobs.get(attachment.id))?.blob.text()).toBe('note')
  expect((await appDatabase.versions.where('documentId').equals(a.id).first())?.root.id).toBe(a.root.id)
  expect(await appDatabase.papers.count()).toBe(1)
  const relation = await appDatabase.annotationNodeRelations.where('documentId').equals(a.id).first()
  expect(relation?.annotationId).not.toBe('annotation')
  expect(relation?.nodeId).toBe(a.root.children[0].id)
  expect((await appDatabase.paperAnnotations.get(relation!.annotationId))?.paperId).toBe('paper')
  expect(await appDatabase.meta.get('unrelated-setting')).toEqual({ key: 'unrelated-setting', value: 'must-not-export' })
})

it('selects individual maps from a full backup and skips already imported source maps independently', async () => {
  const file = await createLocalBackup()
  const prepared = await prepareMapImport(file.blob)
  expect(await importSelectedMaps(prepared, ['a'])).toMatchObject({ documentCount: 1, skipped: 0 })
  expect(await importSelectedMaps(prepared, ['a', 'b'])).toMatchObject({ documentCount: 1, skipped: 1 })
  expect(await importSelectedMaps(prepared, ['a', 'b'])).toMatchObject({ documentCount: 0, skipped: 2 })
  expect((await appDatabase.documents.toArray()).map(d => d.title).sort()).toEqual(['乙', '乙 (2)', '未选择', '甲', '甲 (2)'].sort())
  expect(await appDatabase.paperAnnotations.count()).toBe(2)
})

it('rejects corrupted input and rolls back every added record on a write failure', async () => {
  const original = await current()
  const backup = await createPartialBackup(['a'], original)
  const text = await backup.blob.text()
  await expect(prepareMapImport(new Blob([text.replace('共享论文', '破坏论文')]))).rejects.toThrow('完整性校验失败')
  const prepared = await prepareMapImport(backup.blob)
  const counts = await Promise.all(appDatabase.tables.map(t => t.count()))
  vi.spyOn(appDatabase.attachmentBlobs, 'add').mockRejectedValueOnce(new Error('simulated failure'))
  await expect(importSelectedMaps(prepared, ['a'])).rejects.toThrow('simulated failure')
  expect(await Promise.all(appDatabase.tables.map(t => t.count()))).toEqual(counts)
  expect(await current()).toEqual(original)
})

it('stops an incomplete binary backup instead of silently omitting a linked file', async () => {
  await appDatabase.paperFiles.delete('paper')
  await expect(createPartialBackup(['a'], await current())).rejects.toThrow('PDF 不在本机')
  expect(await appDatabase.documents.count()).toBe(3)
})
