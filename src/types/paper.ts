export interface Paper {
  id: string
  userId: string
  title: string
  fileName: string
  filePath: string
  fileSize: number
  pageCount: number
  checksum: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface PaperFileCache {
  paperId: string
  blob: Blob
  cachedAt: string
}

export interface PaperReadingState {
  paperId: string
  pageNumber: number
  scale: number
  scrollOffset: number
  updatedAt: string
}

export interface NodePaperRelation {
  id: string
  documentId: string
  nodeId: string
  paperId: string
  createdAt: string
  deletedAt?: string
}

export interface LinkedPaper extends Paper {
  relationId: string
  annotationCount: number
}
