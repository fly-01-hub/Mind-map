import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDatabase } from '../db/appDatabase'
import { documentRepository } from './documentRepository'
import { createNode } from '../utils/tree'
import type { MindMapDocument } from '../types/mindmap'

describe('empty public installation', () => {
  beforeEach(async () => {
    await appDatabase.transaction('rw', appDatabase.tables, async () => {
      for (const table of appDatabase.tables) await table.clear()
    })
  })

  it('initializes an empty database without sample documents or folders', async () => {
    await documentRepository.initialize()
    await documentRepository.initialize()
    for (const table of appDatabase.tables.filter((table) => table.name !== 'meta')) {
      expect(await table.count(), table.name).toBe(0)
    }
    expect(await appDatabase.meta.get('initialized')).toBeDefined()
  })

  it('preserves existing documents, folders and attachments even without the initialization flag', async () => {
    const root = createNode('用户自行创建的内容')
    const document: MindMapDocument = { id: 'existing', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    await appDatabase.documents.put(document)
    await appDatabase.folders.put({ id: 'existing-folder', name: '用户文件夹', order: 0, createdAt: root.createdAt, updatedAt: root.updatedAt })
    await appDatabase.attachmentBlobs.put({ id: 'existing-attachment', documentId: document.id, nodeId: root.id, blob: new Blob(['retained']), createdAt: root.createdAt })
    await documentRepository.initialize()
    expect(await appDatabase.documents.toArray()).toEqual([document])
    expect(await appDatabase.folders.count()).toBe(1)
    expect(await appDatabase.attachmentBlobs.count()).toBe(1)
  })
})

describe('document batch persistence', () => {
  beforeEach(async () => { await appDatabase.documents.clear() })
  it('rolls back every document in a rename batch if any record cannot be written', async () => {
    const root = createNode('原名')
    const original: MindMapDocument = { id: 'safe', title: '原名', root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    await documentRepository.saveDocument(original)
    const broken = { ...original, id: undefined } as unknown as MindMapDocument
    await expect(documentRepository.saveDocuments([{ ...original, title: '新名' }, broken])).rejects.toThrow()
    expect((await appDatabase.documents.get('safe'))?.title).toBe('原名')
    expect(await appDatabase.documents.count()).toBe(1)
  })

  it('rejects a stale writer and rolls documents and folders back together', async () => {
    const root = createNode('version one')
    const original: MindMapDocument = { id: 'guarded', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    const newer = { ...original, version: 3, updatedAt: 'newer', root: { ...root, note: 'saved elsewhere' } }
    await appDatabase.documents.put(newer)
    await expect(documentRepository.saveWorkspace([{ ...original, version: 2 }], undefined, { documents: new Map([[original.id, original]]) })).rejects.toThrow('停止覆盖')
    expect(await appDatabase.documents.get(original.id)).toEqual(newer)
    const malformed = { name: 'invalid key' } as unknown as import('../types/mindmap').FolderData
    await expect(documentRepository.saveWorkspace([{ ...newer, title: 'must roll back' }], [malformed])).rejects.toThrow()
    expect(await appDatabase.documents.get(original.id)).toEqual(newer)
  })

  it('rejects differing saved content even when revision numbers and timestamps match', async () => {
    const root = createNode('same metadata')
    const baseline: MindMapDocument = { id: 'same-metadata', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    const other = { ...baseline, root: { ...root, note: 'written elsewhere' } }
    await appDatabase.documents.put(other)
    await expect(documentRepository.saveWorkspace([{ ...baseline, version: 2, root: { ...root, note: 'my edit' } }], undefined, { documents: new Map([[baseline.id, baseline]]) })).rejects.toThrow('停止覆盖')
    expect(await appDatabase.documents.get(baseline.id)).toEqual(other)
  })
})
