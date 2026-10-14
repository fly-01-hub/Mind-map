import { describe, expect, it } from 'vitest'
import { createNode, insertChild, insertSibling, mapNode, normalizeOrders, removeSubtree } from '../../utils/tree'
import { incrementalTree } from './incrementalTree'
import { useDocumentStore } from '../../stores/documentStore'

function sample() {
  return normalizeOrders({ ...createNode('root'), children: [
    { ...createNode('branch'), children: [createNode('leaf')] }, createNode('sibling'),
  ] })
}

describe('incremental large-map edits', () => {
  it('preserves untouched branches and plans insertion, updates and undo removal', () => {
    const root = sample()
    const added = createNode('new leaf')
    const next = insertChild(root, root.children[0].id, added)
    expect(next.children[1]).toBe(root.children[1])
    expect(next.children[0].children[0]).toBe(root.children[0].children[0])
    expect(incrementalTree(root, next)?.insertion).toEqual({ parentId: root.children[0].id, node: next.children[0].children[1], beforeId: undefined })
    expect(incrementalTree(next, root)?.removal).toBe(added.id)
    const edited = mapNode(next, added.id, (node) => ({ ...node, title: 'edited', note: 'a longer note' }))
    expect(incrementalTree(next, edited)?.updates.map((node) => node.id)).toEqual([added.id])
    const middle = insertSibling(root, root.children[0].id, createNode('middle'))
    expect(incrementalTree(root, middle)?.insertion?.beforeId).toBe(root.children[1].id)
    expect(incrementalTree(root, removeSubtree(root, root.children[1].id))?.removal).toBe(root.children[1].id)
  })

  it('falls back for moved branches, new subtrees, collapsed parents and large replacements', () => {
    const root = sample()
    expect(incrementalTree(root, { ...root, children: [...root.children].reverse() })).toBeUndefined()
    expect(incrementalTree(root, { ...root, collapsed: true, children: root.children.map((node) => ({ ...node, collapsed: true })) })).toBeUndefined()
    expect(incrementalTree(root, insertChild(root, root.id, { ...createNode('subtree'), children: [createNode('nested')] }))).toBeUndefined()
    const collapsed = { ...root, collapsed: true }
    expect(incrementalTree(collapsed, insertChild(collapsed, root.id))).toBeUndefined()
    const many = normalizeOrders({ ...createNode('many'), children: Array.from({ length: 10 }, () => createNode('old')) })
    expect(incrementalTree(many, { ...many, children: many.children.map((node) => ({ ...node, title: 'new' })) })).toBeUndefined()
  })

  it('retains immutable branches across 50 history entries and restores edits without data loss', () => {
    const root = sample()
    const document = { id: 'history-performance', title: root.title, root, version: 1, isFavorite: false, createdAt: root.createdAt, updatedAt: root.updatedAt }
    useDocumentStore.setState({ documents: [document], activeDocumentId: document.id, histories: {} })
    const store = useDocumentStore.getState()
    for (let i = 0; i < 55; i++) store.updateNode(root.children[0].children[0].id, { note: `note ${i}` })
    const history = useDocumentStore.getState().histories[document.id]
    expect(history.past).toHaveLength(50)
    expect(history.past.every((entry) => entry.root.children[1] === root.children[1])).toBe(true)
    expect(root.children[0].children[0].note).toBe('')
    store.undo()
    expect(useDocumentStore.getState().documents[0].root.children[0].children[0].note).toBe('note 53')
    store.redo()
    expect(useDocumentStore.getState().documents[0].root.children[0].children[0].note).toBe('note 54')
  })
})
