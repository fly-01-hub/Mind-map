import { afterEach, expect, it, vi } from 'vitest'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { createNode } from '../../utils/tree'
import { flushLocalPersistence } from './localPersistence'

afterEach(() => vi.restoreAllMocks())

it('serializes overlapping saves and reads the latest state for the second save', async () => {
  const root = createNode('旧标题')
  const document = { id: 'serialized', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
  useDocumentStore.setState({ documents: [document], folders: [] })
  let release!: () => void
  let started!: () => void
  const savingStarted = new Promise<void>((resolve) => { started = resolve })
  const firstSave = new Promise<void>((resolve) => { release = resolve })
  const save = vi.spyOn(documentRepository, 'saveWorkspace').mockImplementationOnce(async () => { started(); await firstSave }).mockResolvedValue(undefined)
  vi.spyOn(documentRepository, 'createVersion').mockResolvedValue({ id: 'version', documentId: document.id, version: 1, title: document.title, root, createdAt: root.createdAt, reason: 'interval' })
  const first = flushLocalPersistence()
  await savingStarted
  useDocumentStore.setState({ documents: [{ ...document, title: '新标题', version: 2, root: { ...root, title: '新标题' } }] })
  const second = flushLocalPersistence()
  expect(save).toHaveBeenCalledTimes(1)
  release()
  await Promise.all([first, second])
  expect(save.mock.calls.map(([documents]) => documents[0].title)).toEqual(['旧标题', '新标题'])
})

it('writes only changed documents and retries an edit after a failed write', async () => {
  const makeDocument = (id: string) => {
    const root = createNode(id)
    return { id, title: id, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
  }
  const first = makeDocument('dirty-first')
  const second = makeDocument('dirty-second')
  const folders: [] = []
  useDocumentStore.setState({ documents: [first, second], folders })
  const save = vi.spyOn(documentRepository, 'saveWorkspace').mockResolvedValue(undefined)
  vi.spyOn(documentRepository, 'createVersion').mockImplementation(async (document) => ({ id: document.id, documentId: document.id, version: document.version, title: document.title, root: document.root, createdAt: document.createdAt, reason: 'interval' }))
  await flushLocalPersistence()
  save.mockClear()
  const edited = { ...second, version: 2, root: { ...second.root, note: 'changed' } }
  useDocumentStore.setState({ documents: [first, edited] })
  save.mockRejectedValueOnce(new Error('write failed'))
  await expect(flushLocalPersistence()).rejects.toThrow('write failed')
  await flushLocalPersistence()
  expect(save.mock.calls.map(([documents]) => documents.map((document) => document.id))).toEqual([[second.id], [second.id]])
  expect(save.mock.calls.every(([, folders]) => folders === undefined)).toBe(true)
  await flushLocalPersistence()
  expect(save).toHaveBeenCalledTimes(2)
})
