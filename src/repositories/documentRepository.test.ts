import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDatabase } from '../db/appDatabase'
import { documentRepository } from './documentRepository'
import { createNode } from '../utils/tree'
import type { MindMapDocument } from '../types/mindmap'

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
})
