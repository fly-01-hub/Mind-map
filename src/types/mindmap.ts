export type TaskStatus = 'none' | 'todo' | 'doing' | 'done'

export interface NodeStyle {
  color?: string
  background?: string
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
}

export interface Attachment {
  id: string
  fileName: string
  mimeType: string
  size: number
  storagePath: string
  createdAt: string
  pageNumber?: number
  quote?: string
  note?: string
  deletedAt?: string
}

export interface NodeImage {
  url: string
  width: number
  height: number
}

export interface NodeData {
  id: string
  title: string
  children: NodeData[]
  collapsed: boolean
  order: number
  createdAt: string
  updatedAt: string
  style: NodeStyle
  tags: string[]
  taskStatus: TaskStatus
  hyperlink?: string
  note: string
  code?: string
  formula?: string
  icon?: string
  image?: NodeImage
  attachments: Attachment[]
}

export interface MindMapDocument {
  id: string
  title: string
  root: NodeData
  folderId?: string
  isFavorite: boolean
  version: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface FolderData {
  id: string
  name: string
  parentId?: string
  order: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  title: string
  root: NodeData
  createdAt: string
  reason: 'interval' | 'important' | 'before-restore' | 'conflict'
}

export type SaveStatus = 'saving' | 'local' | 'error'

export interface ClipboardPayload {
  mode: 'copy' | 'cut'
  node: NodeData
  sourceId: string
}
