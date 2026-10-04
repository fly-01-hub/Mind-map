import { appDatabase } from '../db/appDatabase'
import type { NewPaperAnnotation, PaperAnnotation, AnnotationColor, AnnotationPositionData } from '../types/annotation'

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

  async updateMetadata(id: string, metadata: { color?: AnnotationColor; tags?: string[] }) {
    await appDatabase.paperAnnotations.update(id, { ...metadata, updatedAt: new Date().toISOString() })
  },
  async updateArea(id: string, positionData: AnnotationPositionData, previewImage: string, color?: AnnotationColor) {
    return appDatabase.transaction('rw', appDatabase.paperAnnotations, async () => {
      const annotation = await appDatabase.paperAnnotations.get(id)
      if (!annotation || annotation.deletedAt || annotation.annotationType !== 'area') throw new Error('区域批注不存在。')
      const updated = { ...annotation, positionData, previewImage, color: color ?? annotation.color, updatedAt: new Date().toISOString() }
      await appDatabase.paperAnnotations.put(updated)
      return updated
    })
  },

  async restore(id: string) {
    await appDatabase.paperAnnotations.update(id, { deletedAt: undefined, updatedAt: new Date().toISOString() })
  },

  async softDelete(id: string) {
    const timestamp = new Date().toISOString()
    await appDatabase.paperAnnotations.update(id, { deletedAt: timestamp, updatedAt: timestamp })
  },
}
