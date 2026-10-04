export type PaperAnnotationType = 'highlight' | 'underline' | 'note' | 'area'
export type AnnotationColor = 'yellow' | 'red' | 'green' | 'blue' | 'purple'

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
  areaStyle?: 'highlight' | 'outline'
  color?: AnnotationColor
  tags?: string[]
  previewImage?: string
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
  areaStyle?: 'highlight' | 'outline'
  kind?: 'text' | 'area'
  previewImage?: string
  pageNumber: number
  selectedText: string
  positionData: AnnotationPositionData
  anchor: { left: number; top: number }
}

export interface NewPaperAnnotation {
  areaStyle?: 'highlight' | 'outline'
  color?: AnnotationColor
  tags?: string[]
  previewImage?: string
  paperId: string
  userId: string
  annotationType: PaperAnnotationType
  pageNumber: number
  content: string
  selectedText: string
  positionData: AnnotationPositionData
}
