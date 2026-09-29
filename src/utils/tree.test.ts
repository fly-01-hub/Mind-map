import { describe, expect, it } from 'vitest'
import {
  createNode, duplicateSubtree, expandPathToNode, findNode, findParent, indentNode, insertChild, insertSibling,
  mergeNodeInto, moveSubtree, moveSubtreeRelative, moveSubtreesRelative, promoteNode, removeNodeKeepChildren,
  removeSubtree, splitNode, topLevelSelectedNodes,
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

  it('indents a topic below its previous sibling', () => {
    const root = createNode('Root')
    const first = createNode('First')
    const second = createNode('Second')
    const result = indentNode({ ...root, children: [first, second] }, second.id)
    expect(result.children.map((node) => node.title)).toEqual(['First'])
    expect(result.children[0].children.map((node) => node.title)).toEqual(['Second'])
  })

  it('splits and merges outline topics without losing child nodes', () => {
    const root = createNode('Root')
    const child = { ...createNode('AlphaBeta'), children: [createNode('Nested')] }
    const split = splitNode({ ...root, children: [child] }, child.id, 'Alpha', 'Beta')
    expect(split.root.children.map((node) => node.title)).toEqual(['Alpha', 'Beta'])
    expect(split.root.children[0].children[0].title).toBe('Nested')
    const merged = mergeNodeInto(split.root, split.newId!, child.id)
    expect(merged.children.map((node) => node.title)).toEqual(['AlphaBeta'])
    expect(merged.children[0].children[0].title).toBe('Nested')
  })

  it('moves a subtree to another parent and rejects cycles', () => {
    const { root, ids } = sample()
    const moved = moveSubtree(root, ids.c, ids.root, 0)
    expect(findParent(moved, ids.c)?.parent.id).toBe(ids.root)
    expect(moveSubtree(root, ids.a, ids.c)).toEqual(root)
  })

  it('reorders topics relative to a drop target', () => {
    const root = createNode('Root')
    const a = createNode('A')
    const b = createNode('B')
    const c = createNode('C')
    const source = { ...root, children: [a, b, c] }
    expect(moveSubtreeRelative(source, a.id, c.id, 'after').children.map((node) => node.title)).toEqual(['B', 'C', 'A'])
    expect(moveSubtreeRelative(source, c.id, a.id, 'before').children.map((node) => node.title)).toEqual(['C', 'A', 'B'])
  })

  it('duplicates a subtree with fresh ids', () => {
    const { root, ids } = sample()
    const result = duplicateSubtree(root, ids.b)
    const copy = result.newId ? findNode(result.root, result.newId) : undefined
    expect(copy?.title).toBe('B')
    expect(copy?.id).not.toBe(ids.b)
    expect(copy?.children[0].id).not.toBe(ids.c)
  })

  it('deduplicates nested multi-selections and moves them in document order', () => {
    const root = createNode('Root')
    const a = { ...createNode('A'), children: [createNode('A child')] }
    const b = createNode('B')
    const c = createNode('C')
    const source = { ...root, children: [a, b, c] }
    expect(topLevelSelectedNodes(source, [a.id, a.children[0].id, b.id]).map((node) => node.title)).toEqual(['A', 'B'])

    const result = moveSubtreesRelative(source, [a.id, b.id], c.id, 'inside')
    expect(result.children.map((node) => node.title)).toEqual(['C'])
    expect(result.children[0].children.map((node) => node.title)).toEqual(['A', 'B'])
  })

  it('expands only the ancestor path needed to reveal a linked node', () => {
    const { root, ids } = sample()
    root.collapsed = true
    root.children[0].collapsed = true
    root.children[0].children[0].collapsed = true
    root.children[0].children[0].children[0].collapsed = true
    const result = expandPathToNode(root, ids.c)
    expect(result.collapsed).toBe(false)
    expect(findNode(result, ids.a)?.collapsed).toBe(false)
    expect(findNode(result, ids.b)?.collapsed).toBe(false)
    expect(findNode(result, ids.c)?.collapsed).toBe(true)
    expect(expandPathToNode(root, 'missing')).toBe(root)
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
