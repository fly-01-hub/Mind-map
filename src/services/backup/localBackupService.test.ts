import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { createLocalBackup, restoreLocalBackup } from './localBackupService'

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
      id: 'document-1', title: '备份测试', root, isFavorite: true,
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
      id: 'annotation-1', paperId: 'paper-1', userId: 'former-cloud-account', annotationType: 'highlight',
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
    expect((await appDatabase.papers.get('paper-1'))?.userId).toBe('former-cloud-account')
    expect(Array.from(new Uint8Array(await (await appDatabase.attachmentBlobs.get('attachment-1'))!.blob.arrayBuffer()))).toEqual([1, 2, 3])
    expect(Array.from(new Uint8Array(await (await appDatabase.paperFiles.get('paper-1'))!.blob.arrayBuffer()))).toEqual([37, 80, 68, 70])
    expect(await appDatabase.meta.get('last-restored-at')).toBeDefined()
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
})
