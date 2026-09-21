import { appDatabase } from '../db/appDatabase'
import type { NewPaperAnnotation, PaperAnnotation } from '../types/annotation'

export const paperAnnotationRepository = {
  async create(input: NewPaperAnnotation): Promise<PaperAnnotation> {
    const timestamp = new Date().toISOString()
    const annotation: PaperAnnotation = {
      id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp,
    }
    await appDatabase.paperAnnotations.add(annotation)
    return annotation
  },

  async updateContent(id: string, content: string) {
    await appDatabase.paperAnnotations.update(id, { content, updatedAt: new Date().toISOString() })
  },

  async softDelete(id: string) {
    const timestamp = new Date().toISOString()
    await appDatabase.paperAnnotations.update(id, { deletedAt: timestamp, updatedAt: timestamp })
  },
}
