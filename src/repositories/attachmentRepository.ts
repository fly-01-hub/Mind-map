import { appDatabase } from '../db/appDatabase'
import type { Attachment } from '../types/mindmap'

export const attachmentRepository = {
  async save(documentId: string, nodeId: string, file: File): Promise<Attachment> {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await appDatabase.attachmentBlobs.put({ id, documentId, nodeId, blob: file, fileName: file.name, mimeType: file.type, createdAt })
    return {
      id, fileName: file.name, mimeType: file.type || 'application/octet-stream',
      size: file.size, storagePath: `local://${id}`, createdAt,
    }
  },

  async getBlob(attachment: Attachment) {
    return (await appDatabase.attachmentBlobs.get(attachment.id))?.blob
  },

  async softDelete(id: string) {
    await appDatabase.attachmentBlobs.update(id, { deletedAt: new Date().toISOString() })
  },

  async restore(id: string) {
    await appDatabase.attachmentBlobs.update(id, { deletedAt: undefined })
  },
}
