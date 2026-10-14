import { describe, expect, it } from 'vitest'
import type { MindMapDocument } from '../../types/mindmap'
import { createNode, insertChild, mapNode, removeSubtree } from '../../utils/tree'
import { JOURNAL_PREFIX, planRecovery, RecoveryJournal } from './recoveryJournal'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { get length() { return values.size }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => { values.delete(key) }, setItem: (key, value) => { values.set(key, value) } }
}
function document(): MindMapDocument {
  const root = { ...createNode('root'), children: [createNode('first'), { ...createNode('second'), order: 1 }] }
  return { id: crypto.randomUUID(), title: root.title, root, version: 1, createdAt: root.createdAt, updatedAt: root.updatedAt, isFavorite: false }
}
describe('write-ahead recovery', () => {
  it('recovers pending edits, insertion and deletion after interruption without changing the old tree', () => {
    const original = document()
    const root = removeSubtree(insertChild(mapNode(original.root, original.root.children[0].id, (node) => ({ ...node, note: 'unsaved note' })), original.root.id, createNode('added')), original.root.children[1].id)
    const edited = { ...original, version: 2, updatedAt: 'later', root }
    const storage = memoryStorage()
    const journal = new RecoveryJournal(storage)
    const folders: [] = []
    journal.write([edited], folders, new Map([[original.id, original]]), folders, [])
    expect(planRecovery(storage, [original], folders).documents).toEqual([edited])
    expect(original.root.children).toHaveLength(2)
    expect(original.root.children[0].note).toBe('')
    journal.write([edited], folders, new Map([[original.id, edited]]), folders, [])
    expect(storage.length).toBe(0)
  })

  it('protects an unblurred draft and can explicitly remove old rich text', () => {
    const original = document()
    original.root.children[0].richText = '<strong>first</strong>'
    const storage = memoryStorage()
    const journal = new RecoveryJournal(storage)
    const folders: [] = []
    journal.write([original], folders, new Map([[original.id, original]]), folders, [{ documentId: original.id, nodeId: original.root.children[0].id, version: 1, patch: { title: 'typed but not blurred' }, clearFields: ['richText'] }])
    const recovered = planRecovery(storage, [original], folders)
    expect(recovered.documents[0].root.children[0].title).toBe('typed but not blurred')
    expect(recovered.documents[0].root.children[0].richText).toBeUndefined()
    expect(recovered.recovered).toBe(1)
  })

  it('keeps newer database edits and restores conflicting edits into a separate document', () => {
    const original = document()
    const changed = { ...original, version: 2, updatedAt: 'journal', root: { ...original.root, note: 'pending' } }
    const newer = { ...original, version: 3, updatedAt: 'database', root: { ...original.root, note: 'newer saved note' } }
    const storage = memoryStorage()
    const folders: [] = []
    new RecoveryJournal(storage).write([changed], folders, new Map([[original.id, original]]), folders, [])
    const recovered = planRecovery(storage, [newer], folders)
    expect(recovered.documents[0]).toBe(newer)
    expect(recovered.documents[1].root.note).toBe('pending')
    expect(recovered.documents[1].id).not.toBe(newer.id)
    expect(recovered.conflicts).toBe(1)
    expect(planRecovery(storage, [changed], folders).recovered).toBe(0)
  })

  it('keeps a 5000-node edit journal compact and leaves malformed records available for export', () => {
    const original = document()
    original.root.children = Array.from({ length: 5000 }, () => createNode('unchanged'))
    const last = original.root.children.at(-1)!
    const edited = { ...original, version: 2, root: mapNode(original.root, last.id, (node) => ({ ...node, note: 'protected' })) }
    const storage = memoryStorage()
    const folders: [] = []
    const journal = new RecoveryJournal(storage)
    journal.write([edited], folders, new Map([[original.id, original]]), folders, [])
    expect(storage.getItem(journal.key)!.length).toBeLessThan(3000)
    expect(planRecovery(storage, [original], folders).documents[0].root.children.at(-1)?.note).toBe('protected')
    storage.setItem(JOURNAL_PREFIX + 'broken', '{not valid')
    expect(() => planRecovery(storage, [original], folders)).toThrow()
    expect(storage.getItem(JOURNAL_PREFIX + 'broken')).toBe('{not valid')
  })

  it('keeps old document links after recovering a root rename and retains newer folders', () => {
    const original = document()
    const storage = memoryStorage()
    const journal = new RecoveryJournal(storage)
    const folder = { id: 'folder', name: 'old', order: 0, createdAt: '1', updatedAt: '1' }
    journal.write([original], [folder], new Map([[original.id, original]]), [], [{ documentId: original.id, nodeId: original.root.id, version: 1, patch: { title: 'recovered name' }, clearFields: ['richText'] }])
    const newerFolder = { ...folder, name: 'newer saved name', updatedAt: '3' }
    const result = planRecovery(storage, [original], [newerFolder])
    expect(result.documents[0].linkAliases).toContain(original.title)
    expect(result.folders).toEqual([newerFolder])
  })
})
