import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDatabase } from '../db/appDatabase'
import { isPdfFile, paperRepository, titleFromPdfFileName } from './paperRepository'
import { paperAnnotationRepository } from './paperAnnotationRepository'
import { paperKnowledgeService } from '../services/paper/paperKnowledgeService'
import { useDocumentStore } from '../stores/documentStore'
import { createNode, findNode } from '../utils/tree'
import type { MindMapDocument } from '../types/mindmap'

describe('paper repository', () => {
  beforeEach(async () => {
    await appDatabase.open()
    await appDatabase.transaction('rw', [appDatabase.documents, appDatabase.papers, appDatabase.paperFiles, appDatabase.paperReadingStates, appDatabase.paperAnnotations, appDatabase.nodePaperRelations, appDatabase.annotationNodeRelations], async () => {
      await Promise.all([
        appDatabase.documents.clear(),
        appDatabase.papers.clear(),
        appDatabase.paperFiles.clear(),
        appDatabase.paperReadingStates.clear(),
        appDatabase.paperAnnotations.clear(),
        appDatabase.nodePaperRelations.clear(),
        appDatabase.annotationNodeRelations.clear(),
      ])
    })
  })

  it('accepts PDFs and derives a readable title', () => {
    expect(isPdfFile({ name: 'paper.PDF', type: '' })).toBe(true)
    expect(isPdfFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
    expect(titleFromPdfFileName('Attention Is All You Need.pdf')).toBe('Attention Is All You Need')
  })

  it('deduplicates the file while linking one paper to multiple nodes', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
    const first = new File([bytes], 'paper.pdf', { type: 'application/pdf' })
    const duplicate = new File([bytes], 'renamed.pdf', { type: 'application/pdf' })

    const a = await paperRepository.saveAndLink(first, 'document-1', 'node-a', 'local-demo-user')
    const b = await paperRepository.saveAndLink(duplicate, 'document-1', 'node-b', 'local-demo-user')

    expect(b.paper.id).toBe(a.paper.id)
    expect(await appDatabase.papers.count()).toBe(1)
    expect(await appDatabase.paperFiles.count()).toBe(1)
    expect(await appDatabase.nodePaperRelations.count()).toBe(2)
  })

  it('restores an unlinked relation without creating a duplicate', async () => {
    const file = new File(['%PDF-test'], 'paper.pdf', { type: 'application/pdf' })
    const { paper, relation } = await paperRepository.saveAndLink(file, 'document-1', 'node-a', 'local-demo-user')
    await paperRepository.unlink('document-1', 'node-a', paper.id)
    await paperRepository.link('document-1', 'node-a', paper.id)

    const restored = await appDatabase.nodePaperRelations.get(relation.id)
    expect(restored?.deletedAt).toBeUndefined()
    expect(await appDatabase.nodePaperRelations.count()).toBe(1)
  })

  it('persists reading progress and the discovered page count', async () => {
    const file = new File(['%PDF-test'], 'paper.pdf', { type: 'application/pdf' })
    const { paper } = await paperRepository.saveAndLink(file, 'document-1', 'node-a', 'local-demo-user')
    await paperRepository.saveReadingState(paper.id, 18, 1.4, 240)
    const updated = await paperRepository.updatePageCount(paper.id, 32)

    expect(await paperRepository.getReadingState(paper.id)).toMatchObject({ pageNumber: 18, scale: 1.4, scrollOffset: 240 })
    expect(updated?.pageCount).toBe(32)
  })

  it('creates a sourced child node and both provenance relations', async () => {
    const root = createNode('Transformer')
    const document: MindMapDocument = {
      id: 'document-1', title: '研究', root, isFavorite: false, version: 1,
      createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z',
    }
    await appDatabase.documents.put(document)
    useDocumentStore.setState({ documents: [document], activeDocumentId: document.id, histories: {} })
    const file = new File(['%PDF-test'], 'attention.pdf', { type: 'application/pdf' })
    const { paper } = await paperRepository.saveAndLink(file, document.id, root.id, 'local-demo-user')
    const annotation = await paperAnnotationRepository.create({
      paperId: paper.id, userId: 'local-demo-user', annotationType: 'highlight', pageNumber: 5,
      content: '', selectedText: 'Multi-head attention combines representations.',
      positionData: { version: 1, pageWidth: 600, pageHeight: 800, rotation: 0, rects: [{ x: .1, y: .2, width: .4, height: .03 }] },
    })

    const result = await paperKnowledgeService.createNode({
      paper, annotation, documentId: document.id, parentNodeId: root.id,
      title: 'Multi-head Attention', note: '关键机制', userId: 'local-demo-user',
    })

    const updated = useDocumentStore.getState().documents[0]
    expect(findNode(updated.root, result.node.id)).toMatchObject({ title: 'Multi-head Attention' })
    expect(findNode(updated.root, result.node.id)?.note).toBe('关键机制')
    expect((await appDatabase.paperAnnotations.get(annotation.id))?.content).toBe('')
    expect(await appDatabase.annotationNodeRelations.count()).toBe(1)
    expect(await appDatabase.nodePaperRelations.where('nodeId').equals(result.node.id).count()).toBe(1)
  })
})
