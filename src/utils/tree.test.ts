import { describe, expect, it } from 'vitest'
import {
  createNode, duplicateSubtree, findNode, findParent, insertChild, insertSibling,
  moveSubtree, promoteNode, removeNodeKeepChildren, removeSubtree,
} from './tree'
import { useDocumentStore } from '../stores/documentStore'
import { mockDocuments } from '../data/mockDocuments'

function sample() {
  const root = createNode('Root')
  const a = createNode('A')
  const b = createNode('B')
  const c = createNode('C')
  const d = createNode('D')
  return {
    ids: { root: root.id, a: a.id, b: b.id, c: c.id, d: d.id },
    root: { ...root, children: [{ ...a, children: [{ ...b, children: [c, d] }] }] },
  }
}

describe('tree operations', () => {
  it('inserts a child and a sibling in stable order', () => {
    const root = createNode('Root')
    const child = createNode('Child')
    const withChild = insertChild(root, root.id, child)
    const sibling = createNode('Sibling')
    const result = insertSibling(withChild, child.id, sibling)
    expect(result.children.map((node) => node.title)).toEqual(['Child', 'Sibling'])
    expect(result.children.map((node) => node.order)).toEqual([0, 1])
  })

  it('deletes a complete subtree', () => {
    const { root, ids } = sample()
    const result = removeSubtree(root, ids.b)
    expect(findNode(result, ids.b)).toBeUndefined()
    expect(findNode(result, ids.c)).toBeUndefined()
  })

  it('deletes only the selected node and promotes its children', () => {
    const { root, ids } = sample()
    const result = removeNodeKeepChildren(root, ids.b)
    expect(findNode(result, ids.b)).toBeUndefined()
    expect(findNode(result, ids.a)?.children.map((node) => node.title)).toEqual(['C', 'D'])
  })

  it('promotes a node by one level', () => {
    const { root, ids } = sample()
    const result = promoteNode(root, ids.b)
    expect(findParent(result, ids.b)?.parent.id).toBe(ids.root)
    expect(result.children.map((node) => node.title)).toEqual(['A', 'B'])
  })

  it('moves a subtree to another parent and rejects cycles', () => {
    const { root, ids } = sample()
    const moved = moveSubtree(root, ids.c, ids.root, 0)
    expect(findParent(moved, ids.c)?.parent.id).toBe(ids.root)
    expect(moveSubtree(root, ids.a, ids.c)).toEqual(root)
  })

  it('duplicates a subtree with fresh ids', () => {
    const { root, ids } = sample()
    const result = duplicateSubtree(root, ids.b)
    const copy = result.newId ? findNode(result.root, result.newId) : undefined
    expect(copy?.title).toBe('B')
    expect(copy?.id).not.toBe(ids.b)
    expect(copy?.children[0].id).not.toBe(ids.c)
  })

  it('undoes and redoes a committed tree change', () => {
    useDocumentStore.setState({
      documents: structuredClone(mockDocuments),
      activeDocumentId: 'research-map',
      histories: {},
      clipboard: undefined,
    })
    const before = useDocumentStore.getState().documents[0].root.children.length
    useDocumentStore.getState().insertChild(useDocumentStore.getState().documents[0].root.id)
    expect(useDocumentStore.getState().documents[0].root.children).toHaveLength(before + 1)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().documents[0].root.children).toHaveLength(before)
    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().documents[0].root.children).toHaveLength(before + 1)
  })
})
