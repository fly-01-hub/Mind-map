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

export interface NodeTable {
  headers: string[]
  rows: string[][]
}

export interface NodeData {
  id: string
  title: string
  richText?: string
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
  table?: NodeTable
  attachments: Attachment[]
}

export interface MapArrow {
  id: string
  label: string
  from: string
  to: string
  delta1?: { x: number; y: number }
  delta2?: { x: number; y: number }
  bidirectional?: boolean
  style?: {
    stroke?: string
    strokeWidth?: string | number
    strokeDasharray?: string
    opacity?: string | number
    labelColor?: string
  }
}

export interface MapSummary {
  id: string
  label: string
  parent: string
  start: number
  end: number
  nodeIds?: string[]
  style?: { stroke?: string; labelColor?: string }
}

export interface MindMapDocument {
  id: string
  title: string
  root: NodeData
  arrows?: MapArrow[]
  summaries?: MapSummary[]
  mapTheme?: 'paper' | 'ocean' | 'warm' | 'mono'
  compactMap?: boolean
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
  arrows?: MapArrow[]
  summaries?: MapSummary[]
  createdAt: string
  reason: 'interval' | 'important' | 'before-restore' | 'conflict'
}

export type SaveStatus = 'saving' | 'local' | 'error'

export interface ClipboardPayload {
  mode: 'copy' | 'cut'
  nodes: NodeData[]
  sourceIds: string[]
}
