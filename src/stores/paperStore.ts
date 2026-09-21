import { create } from 'zustand'
import { appDatabase } from '../db/appDatabase'
import { paperRepository } from '../repositories/paperRepository'
import { paperSyncService } from '../services/supabase/paperSyncService'
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
      void paperSyncService.syncPending(userId).then(() => get().refresh()).catch(() => {
        set({ error: '论文已保存在本地，云端同步将在联网后重试。' })
      })
      return result.paper
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '论文保存失败。' })
      throw error
    } finally {
      set({ busy: false })
    }
  },
  linkPaper: async (documentId, nodeId, paperId, userId) => {
    await paperRepository.link(documentId, nodeId, paperId)
    await get().refresh()
    void paperSyncService.syncPending(userId).catch(() => {
      set({ error: '关联已保存在本地，云端同步将在联网后重试。' })
    })
  },
  unlinkPaper: async (documentId, nodeId, paperId, userId) => {
    await paperRepository.unlink(documentId, nodeId, paperId)
    await get().refresh()
    void paperSyncService.syncPending(userId).catch(() => {
      set({ error: '更改已保存在本地，云端同步将在联网后重试。' })
    })
  },
  createAnnotation: async (input) => {
    const annotation = await paperAnnotationRepository.create(input)
    await get().refresh()
    void paperSyncService.syncPending(input.userId).catch(() => {
      set({ error: '标注已保存在本地，云端同步将在联网后重试。' })
    })
    return annotation
  },
  updateAnnotationContent: async (id, content, userId) => {
    await paperAnnotationRepository.updateContent(id, content)
    await get().refresh()
    void paperSyncService.syncPending(userId).catch(() => {
      set({ error: '笔记已保存在本地，云端同步将在联网后重试。' })
    })
  },
  deleteAnnotation: async (id, userId) => {
    await paperAnnotationRepository.softDelete(id)
    await get().refresh()
    void paperSyncService.syncPending(userId).catch(() => {
      set({ error: '删除操作已保存在本地，云端同步将在联网后重试。' })
    })
  },
}))
