import { appDatabase } from '../../db/appDatabase'
import type { NodePaperRelation, Paper } from '../../types/paper'
import type { AnnotationNodeRelation, AnnotationPositionData, PaperAnnotation, PaperAnnotationType } from '../../types/annotation'
import { supabase } from './client'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface CloudPaperRow {
  id: string
  user_id: string
  title: string
  file_name: string
  file_path: string
  file_size: number
  page_count: number
  checksum: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface CloudNodePaperRelationRow {
  id: string
  document_id: string
  node_id: string
  paper_id: string
  created_at: string
  deleted_at: string | null
}

interface CloudPaperAnnotationRow {
  id: string
  paper_id: string
  user_id: string
  annotation_type: PaperAnnotationType
  page_number: number
  content: string
  selected_text: string
  position_data: AnnotationPositionData
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface CloudAnnotationNodeRelationRow {
  id: string
  annotation_id: string
  document_id: string
  node_id: string
  created_at: string
  deleted_at: string | null
}

function fromCloudPaper(row: CloudPaperRow): Paper {
  return {
    id: row.id, userId: row.user_id, title: row.title, fileName: row.file_name,
    filePath: row.file_path, fileSize: row.file_size, pageCount: row.page_count,
    checksum: row.checksum, createdAt: row.created_at, updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

function fromCloudRelation(row: CloudNodePaperRelationRow): NodePaperRelation {
  return {
    id: row.id, documentId: row.document_id, nodeId: row.node_id, paperId: row.paper_id,
    createdAt: row.created_at, deletedAt: row.deleted_at ?? undefined,
  }
}

function fromCloudAnnotation(row: CloudPaperAnnotationRow): PaperAnnotation {
  return {
    id: row.id, paperId: row.paper_id, userId: row.user_id, annotationType: row.annotation_type,
    pageNumber: row.page_number, content: row.content, selectedText: row.selected_text,
    positionData: row.position_data, createdAt: row.created_at, updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

function fromCloudAnnotationRelation(row: CloudAnnotationNodeRelationRow): AnnotationNodeRelation {
  return {
    id: row.id, annotationId: row.annotation_id, documentId: row.document_id,
    nodeId: row.node_id, createdAt: row.created_at, deletedAt: row.deleted_at ?? undefined,
  }
}

export const paperSyncService = {
  async pull(userId: string) {
    if (!supabase || !navigator.onLine) return
    const [{ data: paperRows, error: paperError }, { data: relationRows, error: relationError }, { data: annotationRows, error: annotationError }, { data: annotationRelationRows, error: annotationRelationError }] = await Promise.all([
      supabase.from('papers').select('id,user_id,title,file_name,file_path,file_size,page_count,checksum,created_at,updated_at,deleted_at'),
      supabase.from('node_paper_relations').select('id,document_id,node_id,paper_id,created_at,deleted_at'),
      supabase.from('paper_annotations').select('id,paper_id,user_id,annotation_type,page_number,content,selected_text,position_data,created_at,updated_at,deleted_at'),
      supabase.from('annotation_node_relations').select('id,annotation_id,document_id,node_id,created_at,deleted_at'),
    ])
    if (paperError) throw paperError
    if (relationError) throw relationError
    if (annotationError) throw annotationError
    if (annotationRelationError) throw annotationRelationError
    const papers = (paperRows ?? []).map((row) => fromCloudPaper(row as CloudPaperRow))
      .filter((paper) => paper.userId === userId)
    const relations = (relationRows ?? []).map((row) => fromCloudRelation(row as CloudNodePaperRelationRow))
    const annotations = (annotationRows ?? []).map((row) => fromCloudAnnotation(row as CloudPaperAnnotationRow))
      .filter((annotation) => annotation.userId === userId)
    const annotationRelations = (annotationRelationRows ?? []).map((row) => fromCloudAnnotationRelation(row as CloudAnnotationNodeRelationRow))
    await appDatabase.transaction('rw', [appDatabase.papers, appDatabase.nodePaperRelations, appDatabase.paperAnnotations, appDatabase.annotationNodeRelations], async () => {
      for (const paper of papers) {
        const local = await appDatabase.papers.get(paper.id)
        if (!local || (!local.filePath.startsWith('local://') && paper.updatedAt >= local.updatedAt)) {
          await appDatabase.papers.put(paper)
        }
      }
      for (const relation of relations) {
        const local = await appDatabase.nodePaperRelations.get(relation.id)
        if (!local || relation.deletedAt || !local.deletedAt) await appDatabase.nodePaperRelations.put(relation)
      }
      for (const annotation of annotations) {
        const local = await appDatabase.paperAnnotations.get(annotation.id)
        if (!local || annotation.updatedAt >= local.updatedAt) await appDatabase.paperAnnotations.put(annotation)
      }
      for (const relation of annotationRelations) {
        const local = await appDatabase.annotationNodeRelations.get(relation.id)
        if (!local || relation.deletedAt || !local.deletedAt) await appDatabase.annotationNodeRelations.put(relation)
      }
    })
  },

  async syncPending(userId: string) {
    if (!supabase || !navigator.onLine || !uuidPattern.test(userId)) return
    const papers = await appDatabase.papers.where('userId').equals(userId).toArray()
    for (const paper of papers) {
      let ready = paper
      if (paper.filePath.startsWith('local://') && !paper.deletedAt) {
        const blob = (await appDatabase.paperFiles.get(paper.id))?.blob
        if (!blob) continue
        const safeName = paper.fileName.replace(/[^\w.\-\u4e00-\u9fff]/g, '_')
        const filePath = `${userId}/${paper.id}/${safeName}`
        const { error } = await supabase.storage.from('papers').upload(filePath, blob, { upsert: true, contentType: 'application/pdf' })
        if (error) throw error
        ready = { ...paper, filePath, updatedAt: new Date().toISOString() }
        await appDatabase.papers.put(ready)
      }
      const { error } = await supabase.from('papers').upsert({
        id: ready.id, user_id: userId, title: ready.title, file_name: ready.fileName,
        file_path: ready.filePath, file_size: ready.fileSize, page_count: ready.pageCount,
        checksum: ready.checksum, created_at: ready.createdAt, updated_at: ready.updatedAt,
        deleted_at: ready.deletedAt ?? null,
      })
      if (error) throw error
    }

    const paperIds = new Set(papers.map((paper) => paper.id))
    const relations = (await appDatabase.nodePaperRelations.toArray())
      .filter((relation) => paperIds.has(relation.paperId) && uuidPattern.test(relation.documentId))
    if (relations.length) {
      const { error } = await supabase.from('node_paper_relations').upsert(relations.map((relation) => ({
        id: relation.id, user_id: userId, document_id: relation.documentId, node_id: relation.nodeId,
        paper_id: relation.paperId, created_at: relation.createdAt, deleted_at: relation.deletedAt ?? null,
      })))
      if (error) throw error
    }

    const annotations = await appDatabase.paperAnnotations.where('userId').equals(userId).toArray()
    if (annotations.length) {
      const { error } = await supabase.from('paper_annotations').upsert(annotations.map((annotation) => ({
        id: annotation.id, paper_id: annotation.paperId, user_id: userId,
        annotation_type: annotation.annotationType, page_number: annotation.pageNumber,
        content: annotation.content, selected_text: annotation.selectedText,
        position_data: annotation.positionData, created_at: annotation.createdAt,
        updated_at: annotation.updatedAt, deleted_at: annotation.deletedAt ?? null,
      })))
      if (error) throw error
    }

    const annotationIds = new Set(annotations.map((annotation) => annotation.id))
    const annotationRelations = (await appDatabase.annotationNodeRelations.toArray())
      .filter((relation) => annotationIds.has(relation.annotationId) && uuidPattern.test(relation.documentId))
    if (annotationRelations.length) {
      const { error } = await supabase.from('annotation_node_relations').upsert(annotationRelations.map((relation) => ({
        id: relation.id, user_id: userId, annotation_id: relation.annotationId,
        document_id: relation.documentId, node_id: relation.nodeId,
        created_at: relation.createdAt, deleted_at: relation.deletedAt ?? null,
      })))
      if (error) throw error
    }
  },
}
