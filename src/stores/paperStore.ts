import { create } from 'zustand'
import { appDatabase } from '../db/appDatabase'
import { paperRepository } from '../repositories/paperRepository'
import type { AnnotationNodeRelation, PaperAnnotation, AnnotationColor, AnnotationPositionData } from '../types/annotation'
import type { NewPaperAnnotation } from '../types/annotation'
import { paperAnnotationRepository } from '../repositories/paperAnnotationRepository'
import type { NodePaperRelation, Paper } from '../types/paper'
import { useDocumentStore } from './documentStore'
import { useSaveStore } from './saveStore'
import { findNode, mapNode } from '../utils/tree'

interface PaperState {
  papers: Paper[]
  relations: NodePaperRelation[]
  annotations: PaperAnnotation[]
  annotationNodeRelations: AnnotationNodeRelation[]
  hydrated: boolean
  busy: boolean
  error?: string
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
  uploadAndLink: (file: File, documentId: string, nodeId: string, userId: string) => Promise<Paper>
  linkPaper: (documentId: string, nodeId: string, paperId: string, userId: string) => Promise<void>
  unlinkPaper: (documentId: string, nodeId: string, paperId: string, userId: string) => Promise<void>
  createAnnotation: (input: NewPaperAnnotation) => Promise<PaperAnnotation>
  updateAnnotationContent: (id: string, content: string, userId: string) => Promise<void>
  deleteAnnotation: (id: string, userId: string) => Promise<void>
  restoreAnnotation: (id: string) => Promise<void>
  updateAnnotationMetadata: (id: string, metadata: { color?: AnnotationColor; tags?: string[] }) => Promise<void>
  updateArea: (id: string, position: AnnotationPositionData, preview: string, color?: AnnotationColor) => Promise<PaperAnnotation>
}

export async function loadPaperData() {
  const [papers, relations, annotations, annotationNodeRelations] = await Promise.all([
    paperRepository.listPapers(), paperRepository.listRelations(), paperRepository.listAnnotations(),
    appDatabase.annotationNodeRelations.filter((relation) => !relation.deletedAt).toArray(),
  ])
  return { papers, relations, annotations, annotationNodeRelations }
}

export const usePaperStore = create<PaperState>((set, get) => ({
  papers: [],
  relations: [],
  annotations: [],
  annotationNodeRelations: [],
  hydrated: false,
  busy: false,
  hydrate: async () => set({ ...await loadPaperData(), hydrated: true }),
  refresh: async () => set(await loadPaperData()),
  uploadAndLink: async (file, documentId, nodeId, userId) => {
    set({ busy: true, error: undefined })
    try {
      const result = await paperRepository.saveAndLink(file, documentId, nodeId, userId)
      await get().refresh()
      return result.paper
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '论文保存失败。' })
      throw error
    } finally {
      set({ busy: false })
    }
  },
  linkPaper: async (documentId, nodeId, paperId) => {
    await paperRepository.link(documentId, nodeId, paperId)
    await get().refresh()
  },
  unlinkPaper: async (documentId, nodeId, paperId) => {
    await paperRepository.unlink(documentId, nodeId, paperId)
    await get().refresh()
  },
  createAnnotation: async (input) => {
    const annotation = await paperAnnotationRepository.create(input)
    await get().refresh()
    return annotation
  },
  updateAnnotationContent: async (id, content) => {
    await paperAnnotationRepository.updateContent(id, content)
    await get().refresh()
  },
  deleteAnnotation: async (id) => {
    await paperAnnotationRepository.softDelete(id)
    await get().refresh()
  },
  restoreAnnotation: async (id) => {
    await paperAnnotationRepository.restore(id)
    await get().refresh()
  },
  updateAnnotationMetadata: async (id, metadata) => {
    await paperAnnotationRepository.updateMetadata(id, metadata)
    await get().refresh()
  },
  updateArea: async (id, position, preview, color) => {
    const previous = get().annotations.find((item) => item.id === id)
    const annotation = await paperAnnotationRepository.updateArea(id, position, preview, color)
    // Keep automatically generated region thumbnails current, but never
    // overwrite an image the user has subsequently replaced by hand.
    const state = useDocumentStore.getState()
    const relations = get().annotationNodeRelations.filter((item) => item.annotationId === id)
    const changed = state.documents.filter((document) => !document.deletedAt).flatMap((document) => {
      const ids = relations.filter((item) => item.documentId === document.id).map((item) => item.nodeId)
        .filter((nodeId) => previous?.previewImage && findNode(document.root, nodeId)?.image?.url === previous.previewImage)
      if (!ids.length) return []
      let root = document.root
      for (const nodeId of ids) root = mapNode(root, nodeId, (node) => ({ ...node, image: { ...node.image!, url: preview }, updatedAt: new Date().toISOString() }))
      return [{ ...document, root, version: document.version + 1, updatedAt: new Date().toISOString() }]
    })
    if (changed.length) {
      await appDatabase.documents.bulkPut(structuredClone(changed))
      useDocumentStore.setState((latest) => ({ documents: latest.documents.map((document) => changed.find((item) => item.id === document.id) ?? document) }))
      useSaveStore.getState().markLocal()
    }
    await get().refresh()
    return annotation
  },
}))
