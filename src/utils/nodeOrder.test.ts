import { describe, expect, it } from 'vitest'
import { createNode, findNode, normalizeOrders } from './tree'
import { reorderSiblings } from './nodeOrder'
import { useDocumentStore } from '../stores/documentStore'
import { testDocuments } from '../../tests/fixtures/documents'

function sample() {
  const root = normalizeOrders({ ...createNode('排序'), children: ['A', 'B', 'C', 'D'].map(createNode) })
  root.children[2] = { ...root.children[2], richText: '<span style="color: #b2473e">C</span>',
    note: '[[关联文档]]', taskStatus: 'todo', tags: ['重要'], style: { fontWeight: '700' },
    attachments: [{ id: 'attachment', fileName: '证据.txt', mimeType: 'text/plain', size: 12, storagePath: 'local-blob', createdAt: root.createdAt }],
    children: [createNode('C 的下级')], collapsed: true }
  return root
}
const titles = (root: ReturnType<typeof sample>) => root.children.map((node) => node.title)

describe('same-parent node ordering', () => {
  it('moves to first/last and one step, shifting other siblings stably', () => {
    const root = sample(), c = root.children[2]
    const first = reorderSiblings(root, [c.id], 'moveFirst')
    expect(titles(first)).toEqual(['C', 'A', 'B', 'D'])
    expect(first.children.map((node) => node.order)).toEqual([0, 1, 2, 3])
    expect(findNode(first, c.id)).toEqual({ ...c, order: 0 })
    expect(titles(reorderSiblings(first, [c.id], 'moveDown'))).toEqual(['A', 'C', 'B', 'D'])
    expect(titles(reorderSiblings(root, [c.id], 'moveUp'))).toEqual(['A', 'C', 'B', 'D'])
    expect(titles(reorderSiblings(root, [c.id], 'moveLast'))).toEqual(['A', 'B', 'D', 'C'])
    expect(titles(root)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('moves multi-selected siblings in document order, not click order', () => {
    const root = sample(), [a, b, c, d] = root.children
    expect(titles(reorderSiblings(root, [d.id, b.id, b.id], 'moveFirst'))).toEqual(['B', 'D', 'A', 'C'])
    expect(titles(reorderSiblings(root, [b.id, a.id], 'moveDown'))).toEqual(['C', 'A', 'B', 'D'])
    expect(titles(reorderSiblings(root, [b.id, c.id], 'moveLast'))).toEqual(['A', 'D', 'B', 'C'])
  })

  it('rejects roots, missing nodes, mixed parents and boundaries without changing the tree', () => {
    const root = sample(), [a, , c, d] = root.children
    for (const ids of [[], [root.id], ['missing'], [a.id, c.children[0].id], [c.id, c.children[0].id]]) {
      expect(reorderSiblings(root, ids, 'moveFirst')).toBe(root)
    }
    expect(reorderSiblings(root, [a.id], 'moveUp')).toBe(root)
    expect(reorderSiblings(root, [a.id], 'moveFirst')).toBe(root)
    expect(reorderSiblings(root, [d.id], 'moveDown')).toBe(root)
    expect(reorderSiblings(root, [d.id], 'moveLast')).toBe(root)
  })

  it('records one undo step and preserves relations and legacy summary members', () => {
    const root = sample(), [a, b, c] = root.children
    const document = { ...structuredClone(testDocuments[0]), root, title: root.title,
      arrows: [{ id: 'arrow', from: a.id, to: c.id, label: '关系' }],
      summaries: [{ id: 'summary', parent: root.id, start: 0, end: 1, label: 'AB' }] }
    useDocumentStore.setState({ documents: [document], activeDocumentId: document.id, histories: {} })
    expect(useDocumentStore.getState().reorderSiblings([c.id], 'moveFirst')).toBe('moved')
    const next = useDocumentStore.getState().documents[0]
    expect(next.arrows).toEqual(document.arrows)
    expect(next.summaries![0]).toEqual({ ...document.summaries[0], start: 1, end: 2, nodeIds: [a.id, b.id] })
    expect(next.version).toBe(document.version + 1)
    expect(useDocumentStore.getState().histories[document.id].past).toHaveLength(1)
    expect(useDocumentStore.getState().reorderSiblings([c.id], 'moveFirst')).toBe('unchanged')
    expect(useDocumentStore.getState().histories[document.id].past).toHaveLength(1)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().documents[0].root).toEqual(root)
    expect(useDocumentStore.getState().documents[0].summaries).toEqual(document.summaries)
    useDocumentStore.getState().redo()
    expect(titles(useDocumentStore.getState().documents[0].root)).toEqual(['C', 'A', 'B', 'D'])
  })

  it('does not silently delete a summary when a partial move would split it', () => {
    const root = sample(), [a, b] = root.children
    const document = { ...structuredClone(testDocuments[0]), root, title: root.title,
      summaries: [{ id: 'summary', parent: root.id, start: 0, end: 1, label: 'AB', nodeIds: [a.id, b.id] }] }
    useDocumentStore.setState({ documents: [document], activeDocumentId: document.id, histories: {} })
    expect(useDocumentStore.getState().reorderSiblings([a.id], 'moveLast')).toBe('summary-conflict')
    expect(useDocumentStore.getState().documents[0]).toBe(document)
    expect(useDocumentStore.getState().histories).toEqual({})
    expect(useDocumentStore.getState().reorderSiblings([b.id, a.id], 'moveLast')).toBe('moved')
    expect(titles(useDocumentStore.getState().documents[0].root)).toEqual(['C', 'D', 'A', 'B'])
  })
})
