import type { NodeData } from '../../types/mindmap'

export interface PaperAnalysisInput {
  attachmentId: string
  question?: string
}

export interface AIProvider {
  generateMindMap(input: string): Promise<NodeData>
  summarizeNode(node: NodeData): Promise<string>
  expandNode(node: NodeData): Promise<NodeData[]>
  rewriteNode(node: NodeData, instruction: string): Promise<NodeData>
  analyzePaper(input: PaperAnalysisInput): Promise<string>
  comparePapers(attachmentIds: string[]): Promise<string>
  organizeSubtree(node: NodeData): Promise<NodeData>
}
