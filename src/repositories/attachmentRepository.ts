import { appDatabase } from '../db/appDatabase'
import type { Attachment } from '../types/mindmap'
import { supabase } from '../services/supabase/client'

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

  async uploadPending(attachment: Attachment, documentId: string, nodeId: string, userId: string): Promise<Attachment> {
    if (!supabase || !attachment.storagePath.startsWith('local://')) return attachment
    const stored = await appDatabase.attachmentBlobs.get(attachment.id)
    if (!stored) return attachment
    const safeName = attachment.fileName.replace(/[^\w.\-\u4e00-\u9fff]/g, '_')
    const storagePath = `${userId}/${documentId}/${attachment.id}/${safeName}`
    const { error: uploadError } = await supabase.storage.from('attachments').upload(storagePath, stored.blob, { upsert: true })
    if (uploadError) throw uploadError
    const { error: rowError } = await supabase.from('attachments').upsert({
      id: attachment.id, user_id: userId, document_id: documentId, node_id: nodeId,
      file_name: attachment.fileName, mime_type: attachment.mimeType,
      size: attachment.size, storage_path: storagePath, page_number: attachment.pageNumber ?? null,
      quote: attachment.quote ?? null, note: attachment.note ?? null,
      created_at: attachment.createdAt, deleted_at: attachment.deletedAt ?? null,
    })
    if (rowError) throw rowError
    return { ...attachment, storagePath }
  },

  async getBlob(attachment: Attachment) {
    const local = (await appDatabase.attachmentBlobs.get(attachment.id))?.blob
    if (local) return local
    if (supabase && !attachment.storagePath.startsWith('local://')) {
      const { data } = await supabase.storage.from('attachments').download(attachment.storagePath)
      if (data) return data
    }
  },

  async softDelete(id: string) {
    await appDatabase.attachmentBlobs.update(id, { deletedAt: new Date().toISOString() })
    if (supabase) await supabase.from('attachments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  },

  async restore(id: string) {
    await appDatabase.attachmentBlobs.update(id, { deletedAt: undefined })
    if (supabase) await supabase.from('attachments').update({ deleted_at: null }).eq('id', id)
  },
}
