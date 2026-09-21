import Dexie, { type EntityTable } from 'dexie'
import type { DocumentVersion, FolderData, MindMapDocument } from '../types/mindmap'
import { migrateDocument, migrateNodeData } from './migrations'

export interface StoredAttachmentBlob {
  id: string
  documentId: string
  nodeId: string
  blob: Blob
  fileName?: string
  mimeType?: string
  createdAt: string
  deletedAt?: string
}

export interface AppMeta {
  key: string
  value: string
}

class KnowledgeDatabase extends Dexie {
  documents!: EntityTable<MindMapDocument, 'id'>
  folders!: EntityTable<FolderData, 'id'>
  versions!: EntityTable<DocumentVersion, 'id'>
  attachmentBlobs!: EntityTable<StoredAttachmentBlob, 'id'>
  meta!: EntityTable<AppMeta, 'key'>

  constructor() {
    super('zhijian-knowledge-db')
    this.version(1).stores({
      documents: 'id, folderId, updatedAt, deletedAt, isFavorite',
      folders: 'id, parentId, order, deletedAt',
      versions: 'id, documentId, createdAt, [documentId+createdAt]',
      attachmentBlobs: 'id, documentId, nodeId, deletedAt',
      meta: 'key',
    })
    this.version(2).stores({
      documents: 'id, folderId, updatedAt, deletedAt, isFavorite',
      folders: 'id, parentId, order, deletedAt',
      versions: 'id, documentId, createdAt, [documentId+createdAt]',
      attachmentBlobs: 'id, documentId, nodeId, deletedAt',
      meta: 'key',
    }).upgrade(async (transaction) => {
      await transaction.table('documents').toCollection().modify((document) => {
        const migrated = migrateDocument(document)
        if (migrated) Object.assign(document, migrated)
      })
      await transaction.table('versions').toCollection().modify((version) => {
        version.root = migrateNodeData(version.root)
      })
    })
  }
}

export const appDatabase = new KnowledgeDatabase()
