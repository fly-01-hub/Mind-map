import { create } from 'zustand'
import { appDatabase } from '../db/appDatabase'
import { paperRepository } from '../repositories/paperRepository'
import type { AnnotationNodeRelation, PaperAnnotation } from '../types/annotation'
import type { NewPaperAnnotation } from '../types/annotation'
import { paperAnnotationRepository } from '../repositories/paperAnnotationRepository'
import type { NodePaperRelation, Paper } from '../types/paper'

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
}

async function loadPaperData() {
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
}))
