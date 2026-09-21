import type { PaperAnnotation } from '../../types/annotation'
import type { Paper } from '../../types/paper'

export interface PaperConcept {
  title: string
  description: string
  pageNumber?: number
}

export interface GeneratedPaperNode {
  title: string
  note: string
  children: GeneratedPaperNode[]
}

export interface PaperAIProvider {
  summarizePaper(paper: Paper): Promise<string>
  extractConcepts(paper: Paper): Promise<PaperConcept[]>
  generateMindMapFromPaper(paper: Paper): Promise<GeneratedPaperNode>
  explainSelection(paper: Paper, selection: Pick<PaperAnnotation, 'selectedText' | 'pageNumber'>): Promise<string>
}
