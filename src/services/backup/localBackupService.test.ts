import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { createLocalBackup, latestSafetyBackup, restoreLocalBackup } from './localBackupService'

describe('local backup service', () => {
  beforeEach(async () => {
    await appDatabase.open()
    await appDatabase.transaction('rw', appDatabase.tables, async () => {
      await Promise.all(appDatabase.tables.map((table) => table.clear()))
    })
  })

  it('round-trips records and binary files in one complete backup', async () => {
    const now = '2026-09-22T08:00:00.000Z'
    const root = createNode('备份测试')
    await appDatabase.documents.put({
      id: 'document-1', title: '备份测试', linkAliases: ['原名'], root: { ...root, children: [createNode('链接 [[原名]]')] }, isFavorite: true,
      version: 2, createdAt: now, updatedAt: now,
    })
    await appDatabase.versions.put({
      id: 'version-1', documentId: 'document-1', version: 1, title: '备份测试',
      root, createdAt: now, reason: 'important',
    })
    await appDatabase.attachmentBlobs.put({
      id: 'attachment-1', documentId: 'document-1', nodeId: root.id,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' }), createdAt: now,
    })
    await appDatabase.papers.put({
      id: 'paper-1', userId: 'former-cloud-account', title: '论文', fileName: 'paper.pdf',
      filePath: 'local://paper-1', fileSize: 4, pageCount: 1, checksum: 'checksum-1', createdAt: now, updatedAt: now,
    })
    await appDatabase.paperFiles.put({
      paperId: 'paper-1', blob: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }), cachedAt: now,
    })
    await appDatabase.paperReadingStates.put({ paperId: 'paper-1', pageNumber: 1, scale: 1.2, scrollOffset: 12, updatedAt: now })
    await appDatabase.paperAnnotations.put({
      id: 'annotation-1', paperId: 'paper-1', userId: 'former-cloud-account', annotationType: 'area',
      previewImage: 'data:image/png;base64,aGVsbG8=', areaStyle: 'highlight', color: 'blue', tags: ['图表', '证据'],
      pageNumber: 1, content: '批注', selectedText: '原文', createdAt: now, updatedAt: now,
      positionData: { version: 1, pageWidth: 600, pageHeight: 800, rotation: 0, rects: [] },
    })
    await appDatabase.nodePaperRelations.put({ id: 'relation-1', documentId: 'document-1', nodeId: root.id, paperId: 'paper-1', createdAt: now })
    await appDatabase.annotationNodeRelations.put({ id: 'annotation-relation-1', annotationId: 'annotation-1', documentId: 'document-1', nodeId: root.id, createdAt: now })

    const backup = await createLocalBackup()
    expect(backup.fileName).toMatch(/\.researchmind$/)
    expect(backup.itemCount).toBe(9)

    await appDatabase.transaction('rw', appDatabase.tables, async () => {
      await Promise.all(appDatabase.tables.map((table) => table.clear()))
    })
    const result = await restoreLocalBackup(backup.blob)

    expect(result).toMatchObject({ documentCount: 1, paperCount: 1 })
    expect((await appDatabase.documents.get('document-1'))?.title).toBe('备份测试')
    expect((await appDatabase.documents.get('document-1'))?.linkAliases).toEqual(['原名'])
    expect((await appDatabase.documents.get('document-1'))?.root.children[0].title).toBe('链接 [[原名]]')
    expect((await appDatabase.papers.get('paper-1'))?.userId).toBe('former-cloud-account')
    expect(Array.from(new Uint8Array(await (await appDatabase.attachmentBlobs.get('attachment-1'))!.blob.arrayBuffer()))).toEqual([1, 2, 3])
    expect(Array.from(new Uint8Array(await (await appDatabase.paperFiles.get('paper-1'))!.blob.arrayBuffer()))).toEqual([37, 80, 68, 70])
    expect(await appDatabase.meta.get('last-restored-at')).toBeDefined()
    expect(await appDatabase.paperAnnotations.get('annotation-1')).toMatchObject({ annotationType: 'area', areaStyle: 'highlight', previewImage: 'data:image/png;base64,aGVsbG8=', color: 'blue', tags: ['图表', '证据'] })
    expect(await appDatabase.annotationNodeRelations.get('annotation-relation-1')).toMatchObject({ annotationId: 'annotation-1', nodeId: root.id })
  })

  it('rejects an invalid file without replacing current data', async () => {
    const now = '2026-09-22T08:00:00.000Z'
    await appDatabase.documents.put({
      id: 'safe-document', title: '保留的数据', root: createNode('根节点'),
      isFavorite: false, version: 1, createdAt: now, updatedAt: now,
    })

    await expect(restoreLocalBackup(new Blob(['not json']))).rejects.toThrow('无法读取备份文件')
    expect(await appDatabase.documents.get('safe-document')).toBeDefined()
  })

  it('restores nested folders, document membership, rich content and trash without merging', async () => {
    const now = '2026-10-04T00:00:00.000Z'
    const folders = [
      { id: 'folder-1', name: '研究', order: 0, createdAt: now, updatedAt: now },
      { id: 'folder-2', parentId: 'folder-1', name: '实验', order: 1, createdAt: now, updatedAt: now },
      { id: 'folder-3', parentId: 'folder-2', name: '已删除', order: 2, createdAt: now, updatedAt: now, deletedAt: now },
    ]
    const root = { ...createNode('完整内容'), richText: '<b>完整内容</b>', note: '笔记 [[另一文档]]',
      image: { url: 'data:image/png;base64,aGVsbG8=', width: 120, height: 80 }, tags: ['标签'], children: [createNode('子节点')] }
    const documents = [
      { id: 'doc-1', title: root.title, root, folderId: 'folder-2', linkAliases: ['旧名'],
        isFavorite: true, version: 3, createdAt: now, updatedAt: now },
      { id: 'doc-2', title: '回收站文档', root: createNode('回收站文档'), folderId: 'folder-3',
        isFavorite: false, version: 1, createdAt: now, updatedAt: now, deletedAt: now },
    ]
    await appDatabase.folders.bulkPut(folders)
    await appDatabase.documents.bulkPut(documents)
    const backup = await createLocalBackup()
    await appDatabase.folders.put({ id: 'obsolete', name: '不应合并', order: 9, createdAt: now, updatedAt: now })
    await appDatabase.documents.put({ ...documents[0], title: '修改后的内容', folderId: 'obsolete' })
    await restoreLocalBackup(backup.blob)
    expect(await appDatabase.folders.toArray()).toEqual(folders)
    expect(await appDatabase.documents.toArray()).toEqual(documents)
    expect(await appDatabase.folders.get('obsolete')).toBeUndefined()
  })

  it('rolls back every table when a record fails during replacement', async () => {
    const now = new Date().toISOString()
    const kept = { id: 'keep', title: '不得丢失', root: createNode('不得丢失'), version: 1, isFavorite: false, createdAt: now, updatedAt: now }
    await appDatabase.documents.put(kept)
    const backup = await createLocalBackup()
    const payload = JSON.parse(await backup.blob.text())
    payload.tables.documents[0].title = '不应写入'
    payload.tables.folders.push({ name: '缺少主键，应导致写入失败' })
    await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow()
    expect(await appDatabase.documents.get('keep')).toEqual(kept)
    expect(await appDatabase.folders.count()).toBe(0)
    expect(await appDatabase.meta.get('last-restored-at')).toBeUndefined()
  })

  it('rejects malformed annotations and document roots before replacing data', async () => {
    const now = new Date().toISOString()
    await appDatabase.documents.put({ id: 'keep', title: '保留', root: createNode('保留'), version: 1, isFavorite: false, createdAt: now, updatedAt: now })
    const backup = await createLocalBackup()
    const payload = JSON.parse(await backup.blob.text())
    payload.tables.paperAnnotations.push({ id: 'bad', paperId: 'p', selectedText: 'x', content: '', pageNumber: 1, annotationType: 'area', positionData: { rects: [{ x: 2, y: 0, width: .1, height: .1 }] } })
    await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow('坐标无效')
    expect(await appDatabase.documents.get('keep')).toBeDefined()
    payload.tables.paperAnnotations = []
    payload.tables.documents[0].root = 'invalid'
    await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow('文档结构损坏')
    expect(await appDatabase.documents.get('keep')).toBeDefined()
  })

  it('keeps a complete safety backup and aborts replacement if the safety snapshot cannot be written', async () => {
    const now = new Date().toISOString()
    const original = { id: 'kept', title: 'before restore', root: createNode('before restore'), version: 1, isFavorite: false, createdAt: now, updatedAt: now }
    await appDatabase.documents.put(original)
    await appDatabase.paperFiles.put({ paperId: 'paper', blob: new Blob(['retained PDF']), cachedAt: now })
    const payload = JSON.parse(await (await createLocalBackup()).blob.text())
    delete payload.integrity // Exercise compatible v1 input without a digest.
    payload.tables.documents[0].title = 'after restore'
    const input = new Blob([JSON.stringify(payload)])
    await restoreLocalBackup(input)
    const snapshot = JSON.parse(await (await latestSafetyBackup())!.blob.text())
    expect(snapshot.tables.documents[0]).toEqual(original)
    expect(atob(snapshot.tables.paperFiles[0].blob.base64)).toBe('retained PDF')
    const add = IDBObjectStore.prototype.add
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof add>) {
      if (this.name === 'snapshots') throw new DOMException('quota', 'QuotaExceededError')
      return add.apply(this, args)
    })
    try {
      await expect(restoreLocalBackup(input)).rejects.toThrow('原有资料未被替换')
      expect((await appDatabase.documents.get(original.id))?.title).toBe('after restore')
    } finally { spy.mockRestore() }
  })

  it('detects valid-JSON corruption before modifying any original data', async () => {
    const root = createNode('protected original')
    const original = { id: 'integrity-original', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    await appDatabase.documents.put(original)
    await appDatabase.paperFiles.put({ paperId: 'binary', blob: new Blob(['original PDF bytes']), cachedAt: root.createdAt })
    const backup = await createLocalBackup()
    const payload = JSON.parse(await backup.blob.text())
    expect(payload.integrity.algorithm).toBe('SHA-256')
    payload.tables.documents[0].root.note = 'changed but still valid JSON'
    await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow('完整性校验失败')
    expect(await appDatabase.documents.get(original.id)).toEqual(original)
    payload.tables.documents[0].root.note = ''
    payload.tables.paperFiles[0].blob.base64 = btoa('different PDF bytes')
    await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow('完整性校验失败')
    expect(await (await appDatabase.paperFiles.get('binary'))!.blob.text()).toBe('original PDF bytes')
    expect(await appDatabase.meta.get('last-restored-at')).toBeUndefined()
  })

  it('rolls back the actual replacement transaction after clears and writes have started', async () => {
    const root = createNode('transaction original')
    const original = { id: 'rollback-original', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    await appDatabase.documents.put(original)
    await appDatabase.paperFiles.put({ paperId: 'binary', blob: new Blob(['keep binary']), cachedAt: root.createdAt })
    const backup = await createLocalBackup()
    const payload = JSON.parse(await backup.blob.text())
    delete payload.integrity
    payload.tables.documents[0].root.note = 'must roll back'
    payload.tables.folders.push({ id: 'fail', name: 'new folder' })
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === 'folders') throw new DOMException('Simulated failure during restore', 'QuotaExceededError')
      return put.apply(this, args)
    })
    try { await expect(restoreLocalBackup(new Blob([JSON.stringify(payload)]))).rejects.toThrow() }
    finally { spy.mockRestore() }
    expect(await appDatabase.documents.get(original.id)).toEqual(original)
    expect(await appDatabase.folders.count()).toBe(0)
    expect(await (await appDatabase.paperFiles.get('binary'))!.blob.text()).toBe('keep binary')
    expect(await appDatabase.meta.get('last-restored-at')).toBeUndefined()
  })
})
