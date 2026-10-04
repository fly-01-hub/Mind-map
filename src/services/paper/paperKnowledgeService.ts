import { appDatabase } from '../../db/appDatabase'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import { useSaveStore } from '../../stores/saveStore'
import type { AnnotationColor, PaperAnnotation } from '../../types/annotation'
import type { Paper } from '../../types/paper'
import type { MindMapDocument } from '../../types/mindmap'
import { createNode, findNode, insertChild } from '../../utils/tree'

interface CreatePaperNodeInput {
  paper: Paper
  annotation: PaperAnnotation
  documentId: string
  parentNodeId: string
  title: string
  note: string
  userId: string
}

export const ANNOTATION_DRAG_TYPE = 'application/x-researchmind-annotation'
export const annotationColors: AnnotationColor[] = ['yellow', 'red', 'green', 'blue', 'purple']
export const annotationLabels = { highlight: '高亮', underline: '下划线', note: '批注', area: '区域' }
export const annotationReference = (id: string) => `researchmind://annotation/${encodeURIComponent(id)}`
export function parseAnnotationReference(text: string): string | undefined {
  const match = /^researchmind:\/\/annotation\/([^\s/]+)$/.exec(text.trim())
  if (!match) return undefined
  try { return decodeURIComponent(match[1]) } catch { return undefined }
}

function publishDocument(document: MindMapDocument, updatedDocument: MindMapDocument) {
  useDocumentStore.setState((latest) => {
    const history = latest.histories[document.id] ?? { past: [], future: [] }
    return {
      documents: latest.documents.map((item) => item.id === document.id ? updatedDocument : item),
      histories: { ...latest.histories, [document.id]: { past: [...history.past, structuredClone({ root: document.root, arrows: document.arrows ?? [], summaries: document.summaries ?? [] })].slice(-50), future: [] } },
    }
  })
  useSaveStore.getState().markLocal()
}

async function putRelation(annotation: PaperAnnotation, documentId: string, nodeId: string) {
  const timestamp = new Date().toISOString()
  const previous = await appDatabase.annotationNodeRelations.where('[annotationId+documentId+nodeId]').equals([annotation.id, documentId, nodeId]).first()
  const relation = previous ? { ...previous, deletedAt: undefined }
    : { id: crypto.randomUUID(), annotationId: annotation.id, documentId, nodeId, createdAt: timestamp }
  await appDatabase.annotationNodeRelations.put(relation)
  const existingPaper = await appDatabase.nodePaperRelations.where('[documentId+nodeId+paperId]').equals([documentId, nodeId, annotation.paperId]).first()
  const paperRelation = existingPaper ? { ...existingPaper, deletedAt: undefined }
    : { id: crypto.randomUUID(), documentId, nodeId, paperId: annotation.paperId, createdAt: timestamp }
  await appDatabase.nodePaperRelations.put(paperRelation)
  return { relation, paperRelation }
}

export const paperKnowledgeService = {
  async createLiteratureNode(paper: Paper, documentId: string, parentNodeId: string) {
    const document = useDocumentStore.getState().documents.find((item) => item.id === documentId && !item.deletedAt)
    if (!document || !findNode(document.root, parentNodeId)) throw new Error('目标导图或父节点已被删除。')
    const timestamp = new Date().toISOString(), node = createNode(paper.title)
    node.icon = '📄'
    const updatedDocument = { ...document, root: insertChild(document.root, parentNodeId, node), version: document.version + 1, updatedAt: timestamp }
    await appDatabase.transaction('rw', [appDatabase.documents, appDatabase.papers, appDatabase.nodePaperRelations], async () => {
      const saved = await appDatabase.papers.get(paper.id)
      if (!saved || saved.deletedAt) throw new Error('论文已被删除。')
      if (useDocumentStore.getState().documents.find((item) => item.id === documentId) !== document) throw new Error('导图刚刚发生变化，请重新拖入文献。')
      await appDatabase.documents.put(structuredClone(updatedDocument))
      await appDatabase.nodePaperRelations.add({ id: crypto.randomUUID(), documentId, nodeId: node.id, paperId: paper.id, createdAt: timestamp })
    })
    publishDocument(document, updatedDocument)
    await usePaperStore.getState().refresh()
    return node
  },
  async linkAnnotations(annotationIds: string[], documentId: string, nodeIds: string[]) {
    if (!annotationIds.length || !nodeIds.length) throw new Error('请选择批注和目标节点。')
    const document = useDocumentStore.getState().documents.find((item) => item.id === documentId && !item.deletedAt)
    if (!document || nodeIds.some((id) => !findNode(document.root, id))) throw new Error('目标节点不存在，可能已被删除。')
    const addedIds: string[] = []
    await appDatabase.transaction('rw', [appDatabase.papers, appDatabase.paperAnnotations, appDatabase.nodePaperRelations, appDatabase.annotationNodeRelations], async () => {
      const annotations = await Promise.all([...new Set(annotationIds)].map(async (id) => {
        const annotation = await appDatabase.paperAnnotations.get(id)
        const paper = annotation && await appDatabase.papers.get(annotation.paperId)
        if (!annotation || annotation.deletedAt || !paper || paper.deletedAt) throw new Error('批注或来源论文不存在。')
        return annotation
      }))
      for (const annotation of annotations) for (const nodeId of new Set(nodeIds)) {
        const old = await appDatabase.annotationNodeRelations.where('[annotationId+documentId+nodeId]').equals([annotation.id, documentId, nodeId]).first()
        const { relation } = await putRelation(annotation, documentId, nodeId)
        if (!old || old.deletedAt) addedIds.push(relation.id)
      }
      const latest = useDocumentStore.getState().documents.find((item) => item.id === documentId && !item.deletedAt)
      if (!latest || nodeIds.some((id) => !findNode(latest.root, id))) throw new Error('关联过程中目标节点被删除，请重试。')
    })
    await usePaperStore.getState().refresh()
    return addedIds
  },
  async unlinkRelations(ids: string[]) {
    await appDatabase.annotationNodeRelations.where('id').anyOf(ids).modify({ deletedAt: new Date().toISOString() })
    await usePaperStore.getState().refresh()
  },
  async restoreRelations(ids: string[]) {
    await appDatabase.annotationNodeRelations.where('id').anyOf(ids).modify({ deletedAt: undefined })
    await usePaperStore.getState().refresh()
  },
  async createNode(input: CreatePaperNodeInput) {
    const state = useDocumentStore.getState()
    const document = state.documents.find((item) => item.id === input.documentId && !item.deletedAt)
    if (!document) throw new Error('目标思维导图不存在。')
    if (!findNode(document.root, input.parentNodeId)) throw new Error('目标父节点不存在。')

    const timestamp = new Date().toISOString()
    const node = createNode(input.title.trim() || input.annotation.selectedText.slice(0, 60))
    node.note = input.note.trim()
    if (input.annotation.annotationType === 'area' && input.annotation.previewImage) {
      node.image = { url: input.annotation.previewImage, width: 180, height: 120 }
    }
    const updatedDocument = {
      ...document,
      root: insertChild(document.root, input.parentNodeId, node),
      version: document.version + 1,
      updatedAt: timestamp,
    }
    // Reveal generated evidence even if the literature branch was collapsed.
    const parent = findNode(updatedDocument.root, input.parentNodeId)
    if (parent) parent.collapsed = false
    const annotationRelation = {
      id: crypto.randomUUID(), annotationId: input.annotation.id,
      documentId: document.id, nodeId: node.id, createdAt: timestamp,
    }
    const paperRelation = {
      id: crypto.randomUUID(), documentId: document.id,
      nodeId: node.id, paperId: input.paper.id, createdAt: timestamp,
    }
    const isNew = input.annotation.id.startsWith('pending-')
    const annotation = isNew ? { ...input.annotation, id: crypto.randomUUID() } : input.annotation
    annotationRelation.annotationId = annotation.id

    await appDatabase.transaction(
      'rw',
      [appDatabase.documents, appDatabase.papers, appDatabase.paperAnnotations, appDatabase.nodePaperRelations, appDatabase.annotationNodeRelations],
      async () => {
        const paper = await appDatabase.papers.get(input.paper.id)
        const saved = isNew ? annotation : await appDatabase.paperAnnotations.get(annotation.id)
        if (!paper || paper.deletedAt || !saved || saved.deletedAt || saved.paperId !== paper.id) throw new Error('来源论文或批注已被删除。')
        const latest = useDocumentStore.getState().documents.find((item) => item.id === document.id)
        if (latest !== document) throw new Error('目标导图刚刚发生变化，请再次点击创建。')
        await appDatabase.documents.put(structuredClone(updatedDocument))
        if (isNew) await appDatabase.paperAnnotations.add(annotation)
        await appDatabase.nodePaperRelations.add(paperRelation)
        await appDatabase.annotationNodeRelations.add(annotationRelation)
      },
    )

    publishDocument(document, updatedDocument)
    await usePaperStore.getState().refresh()
    return { node, annotationRelation, paperRelation }
  },
}
