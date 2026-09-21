export type PaperAnnotationType = 'highlight' | 'underline' | 'note'

export interface AnnotationRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnnotationPositionData {
  version: 1
  pageWidth: number
  pageHeight: number
  rotation: number
  rects: AnnotationRect[]
}

export interface PaperAnnotation {
  id: string
  paperId: string
  userId: string
  annotationType: PaperAnnotationType
  pageNumber: number
  content: string
  selectedText: string
  positionData: AnnotationPositionData
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface AnnotationNodeRelation {
  id: string
  annotationId: string
  documentId: string
  nodeId: string
  createdAt: string
  deletedAt?: string
}

export interface PdfTextSelection {
  pageNumber: number
  selectedText: string
  positionData: AnnotationPositionData
  anchor: { left: number; top: number }
}

export interface NewPaperAnnotation {
  paperId: string
  userId: string
  annotationType: PaperAnnotationType
  pageNumber: number
  content: string
  selectedText: string
  positionData: AnnotationPositionData
}
