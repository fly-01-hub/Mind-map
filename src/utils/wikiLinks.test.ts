import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '../stores/documentStore'
import { createNode } from './tree'
import { findBacklinks, matchingDocuments, parseWikiLinks } from './wikiLinks'

describe('document references', () => {
  beforeEach(() => useDocumentStore.setState({ documents: [], histories: {}, activeDocumentId: undefined, nameError: undefined }))

  it('parses multiple names and rejects empty, escaped, multiline and code examples', () => {
    expect(parseWikiLinks('普通 [[ 页面 A ]] 与 [[页面 B]] [[]] [[  ]] \\[[示例]] `[[代码]]` ```\n[[块]]\n``` [[跨\n行]]')
      .map((link) => link.name)).toEqual(['页面 A', '页面 B'])
  })

  it('keeps titles unique and updates incoming references on rename with history aliases', () => {
    const store = useDocumentStore.getState()
    const a = store.createDocument('A')
    const b = store.createDocument('B')
    const c = store.createDocument('B')
    expect(c.title).toBe('B (2)')
    store.openDocument(a.id)
    const nodeId = store.insertChild(a.root.id, '引用 [[B]] 和 [[B]]')!
    store.updateNode(nodeId, { note: '笔记 [[B]]，代码 `[[B]]`' })
    store.renameDocument(b.id, '新 B')
    const documents = useDocumentStore.getState().documents
    const target = documents.find((item) => item.id === b.id)!
    expect(target.root.title).toBe('新 B')
    expect(matchingDocuments(documents, ' b ')[0].id).toBe(b.id)
    expect(findBacklinks(documents, target)).toHaveLength(1)
    expect(documents.find((item) => item.id === a.id)!.root.children[0]).toMatchObject({ title: '引用 [[新 B]] 和 [[新 B]]', note: '笔记 [[新 B]]，代码 `[[B]]`' })
    store.renameDocument(c.id, '新 B')
    expect(useDocumentStore.getState().documents.find((item) => item.id === c.id)?.title).toBe('B (2)')
    expect(useDocumentStore.getState().nameError).toContain('已存在')
  })

  it('keeps root edits and undo/redo synchronized with document names', () => {
    const store = useDocumentStore.getState()
    const a = store.createDocument('A')
    store.updateNode(a.root.id, { title: '新 A' })
    expect(useDocumentStore.getState().documents[0].title).toBe('新 A')
    store.undo()
    expect(useDocumentStore.getState().documents[0].title).toBe('A')
    store.redo()
    expect(useDocumentStore.getState().documents[0].title).toBe('新 A')
  })

  it('does not block editing legacy duplicate names and excludes trash backlinks', () => {
    const store = useDocumentStore.getState()
    const a = store.createDocument('A')
    const b = { ...a, id: 'legacy', root: createNode('A') }
    useDocumentStore.setState({ documents: [a, b] })
    store.updateNode(a.root.id, { note: '可编辑 [[A]]' })
    expect(useDocumentStore.getState().documents[0].root.note).toContain('可编辑')
    expect(matchingDocuments(useDocumentStore.getState().documents, 'A')).toHaveLength(2)
    store.trashDocument(a.id)
    expect(findBacklinks(useDocumentStore.getState().documents, b)).toHaveLength(0)
    store.restoreDocument(a.id)
    expect(useDocumentStore.getState().documents[0].title).toBe('A (2)')
  })
})
