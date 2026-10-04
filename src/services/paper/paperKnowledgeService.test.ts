import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import { paperRepository } from '../../repositories/paperRepository'
import { paperAnnotationRepository } from '../../repositories/paperAnnotationRepository'
import { paperKnowledgeService, annotationReference, parseAnnotationReference } from './paperKnowledgeService'
import type { PaperAnnotation } from '../../types/annotation'

async function setup() {
  const root = createNode('根节点'), child = createNode('已有观点')
  child.note = '原有笔记'; root.children.push(child)
  const timestamp = new Date().toISOString()
  const document = { id: 'link-document', root, title: '研究', version: 1, isFavorite: false, createdAt: timestamp, updatedAt: timestamp }
  await appDatabase.documents.put(document)
  useDocumentStore.setState({ documents: [document], histories: {}, activeDocumentId: document.id })
  const paper = await paperRepository.createOrReuse(new File(['%PDF-test'], 'paper.pdf', { type: 'application/pdf' }), 'local-demo-user')
  const annotation = await paperAnnotationRepository.create({ paperId: paper.id, userId: 'local-demo-user', annotationType: 'highlight', selectedText: '论据', content: '共享批注', pageNumber: 1, positionData: { version: 1, pageWidth: 600, pageHeight: 800, rotation: 0, rects: [{ x: .1, y: .2, width: .3, height: .04 }] } })
  return { root, child, document, paper, annotation }
}

describe('local annotation reference integrity', () => {
  beforeEach(async () => {
    await appDatabase.open()
    await appDatabase.transaction('rw', appDatabase.tables, async () => { await Promise.all(appDatabase.tables.map((table) => table.clear())) })
  })
  it('links many nodes idempotently without changing node or source text', async () => {
    const { document, root, child, annotation } = await setup()
    expect(await paperKnowledgeService.linkAnnotations([annotation.id, annotation.id], document.id, [root.id, child.id, child.id])).toHaveLength(2)
    expect(await paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id, child.id])).toHaveLength(0)
    expect(await appDatabase.annotationNodeRelations.count()).toBe(2)
    expect((await appDatabase.paperAnnotations.get(annotation.id))?.content).toBe('共享批注')
    expect(useDocumentStore.getState().documents[0].root.children[0].note).toBe('原有笔记')
  })
  it('rejects an invalid batch atomically', async () => {
    const { document, root, annotation } = await setup()
    await expect(paperKnowledgeService.linkAnnotations([annotation.id, 'missing'], document.id, [root.id])).rejects.toThrow('批注或来源论文不存在')
    expect(await appDatabase.annotationNodeRelations.count()).toBe(0)
    expect(await appDatabase.nodePaperRelations.count()).toBe(0)
    await expect(paperKnowledgeService.linkAnnotations([annotation.id], document.id, ['missing'])).rejects.toThrow('目标节点不存在')
  })
  it('unlinks and restores the same identity while preserving the annotation', async () => {
    const { document, root, annotation } = await setup()
    const ids = await paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id])
    await paperKnowledgeService.unlinkRelations(ids)
    expect((await appDatabase.annotationNodeRelations.get(ids[0]))?.deletedAt).toBeDefined()
    expect((await appDatabase.paperAnnotations.get(annotation.id))?.deletedAt).toBeUndefined()
    expect(await paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id])).toEqual(ids)
    expect(await appDatabase.annotationNodeRelations.count()).toBe(1)
    await paperKnowledgeService.unlinkRelations(ids); await paperKnowledgeService.restoreRelations(ids)
    expect((await appDatabase.annotationNodeRelations.get(ids[0]))?.deletedAt).toBeUndefined()
  })
  it('soft deletion can be undone without losing backlinks', async () => {
    const { document, root, annotation } = await setup()
    const ids = await paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id])
    await paperAnnotationRepository.softDelete(annotation.id)
    await expect(paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id])).rejects.toThrow()
    await paperAnnotationRepository.restore(annotation.id)
    expect((await appDatabase.annotationNodeRelations.get(ids[0]))?.annotationId).toBe(annotation.id)
    expect((await appDatabase.paperAnnotations.get(annotation.id))?.deletedAt).toBeUndefined()
  })
  it('creates a region source and child atomically and keeps personal notes independent', async () => {
    const { document, root, paper, annotation } = await setup()
    const area: PaperAnnotation = { ...annotation, id: 'pending-area', annotationType: 'area', previewImage: 'data:image/png;base64,aGVsbG8=', color: 'blue', tags: ['图表'] }
    const result = await paperKnowledgeService.createNode({ paper, annotation: area, documentId: document.id, parentNodeId: root.id, title: '结论', note: '我的推论', userId: 'local-demo-user' })
    const saved = await appDatabase.paperAnnotations.get(result.annotationRelation.annotationId)
    expect(saved).toMatchObject({ annotationType: 'area', content: '共享批注', color: 'blue', tags: ['图表'], previewImage: area.previewImage })
    expect(result.node.note).toBe('我的推论')
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().documents[0].root.children.some((node) => node.id === result.node.id)).toBe(false)
    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().documents[0].root.children.some((node) => node.id === result.node.id)).toBe(true)
  })
  it('fails node generation without leaving an orphan annotation', async () => {
    const { document, root, paper, annotation } = await setup()
    const pending = { ...annotation, id: 'pending-source' }
    await appDatabase.papers.update(paper.id, { deletedAt: new Date().toISOString() })
    await expect(paperKnowledgeService.createNode({ paper, annotation: pending, documentId: document.id, parentNodeId: root.id, title: '结论', note: '', userId: 'local-demo-user' })).rejects.toThrow()
    expect(await appDatabase.paperAnnotations.count()).toBe(1)
    expect(await appDatabase.annotationNodeRelations.count()).toBe(0)
    expect(useDocumentStore.getState().documents[0].root.children).toHaveLength(1)
  })
  it('round trips references and safely rejects malformed tokens', () => {
    expect(parseAnnotationReference(annotationReference('test-id'))).toBe('test-id')
    expect(parseAnnotationReference('researchmind://annotation/%')).toBeUndefined()
    expect(parseAnnotationReference('https://example.com/a')).toBeUndefined()
    expect(parseAnnotationReference('researchmind://annotation/a extra')).toBeUndefined()
  })
  it('creates a durable literature anchor with one undo step and rejects missing parents', async () => {
    const { document, root, paper } = await setup()
    await expect(paperKnowledgeService.createLiteratureNode(paper, document.id, 'missing')).rejects.toThrow()
    expect(await appDatabase.nodePaperRelations.count()).toBe(0)
    const node = await paperKnowledgeService.createLiteratureNode(paper, document.id, root.id)
    expect(node).toMatchObject({ title: paper.title, icon: '📄' })
    expect((await appDatabase.documents.get(document.id))?.root.children.at(-1)?.id).toBe(node.id)
    expect(await appDatabase.nodePaperRelations.count()).toBe(1)
    useDocumentStore.getState().undo()
    expect(useDocumentStore.getState().documents[0].root.children).toHaveLength(1)
    useDocumentStore.getState().redo()
    expect(useDocumentStore.getState().documents[0].root.children.at(-1)?.id).toBe(node.id)
  })
  it('updates generated area thumbnails without replacing user-chosen images', async () => {
    const { document, root, paper, annotation } = await setup()
    const area: PaperAnnotation = { ...annotation, id: 'pending-thumbnail', annotationType: 'area', previewImage: 'data:image/png;base64,b2xk' }
    const result = await paperKnowledgeService.createNode({ paper, annotation: area, documentId: document.id, parentNodeId: root.id, title: '区域', note: '', userId: 'local-demo-user' })
    await usePaperStore.getState().updateArea(result.annotationRelation.annotationId, area.positionData, 'data:image/png;base64,bmV3')
    expect(useDocumentStore.getState().documents[0].root.children.at(-1)?.image?.url).toBe('data:image/png;base64,bmV3')
    useDocumentStore.getState().updateNode(result.node.id, { image: { url: 'data:image/png;base64,custom', width: 100, height: 100 } })
    await usePaperStore.getState().updateArea(result.annotationRelation.annotationId, area.positionData, 'data:image/png;base64,bmV4dA==')
    expect(useDocumentStore.getState().documents[0].root.children.at(-1)?.image?.url).toBe('data:image/png;base64,custom')
  })
  it('updates a region in place without losing tags, notes or reference identities', async () => {
    const { document, root, annotation } = await setup()
    await appDatabase.paperAnnotations.put({ ...annotation, annotationType: 'area', tags: ['图表'] })
    const ids = await paperKnowledgeService.linkAnnotations([annotation.id], document.id, [root.id])
    const position = { ...annotation.positionData, rects: [{ x: .3, y: .4, width: .2, height: .1 }] }
    const updated = await paperAnnotationRepository.updateArea(annotation.id, position, 'data:image/png;base64,aGVsbG8=', 'purple')
    expect(updated).toMatchObject({ id: annotation.id, content: '共享批注', tags: ['图表'], color: 'purple', positionData: position })
    expect((await appDatabase.annotationNodeRelations.get(ids[0]))?.annotationId).toBe(annotation.id)
    expect(await appDatabase.paperAnnotations.count()).toBe(1)
  })
})
