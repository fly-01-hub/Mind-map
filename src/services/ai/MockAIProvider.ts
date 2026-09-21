import type { NodeData } from '../../types/mindmap'
import type { AIProvider, PaperAnalysisInput } from './AIProvider'

const unavailable = () => new Error('AI 功能尚未启用；当前 Mock Provider 不会发送网络请求。')

export class MockAIProvider implements AIProvider {
  generateMindMap(_input: string): Promise<NodeData> { return Promise.reject(unavailable()) }
  summarizeNode(_node: NodeData): Promise<string> { return Promise.reject(unavailable()) }
  expandNode(_node: NodeData): Promise<NodeData[]> { return Promise.reject(unavailable()) }
  rewriteNode(_node: NodeData, _instruction: string): Promise<NodeData> { return Promise.reject(unavailable()) }
  analyzePaper(_input: PaperAnalysisInput): Promise<string> { return Promise.reject(unavailable()) }
  comparePapers(_attachmentIds: string[]): Promise<string> { return Promise.reject(unavailable()) }
  organizeSubtree(_node: NodeData): Promise<NodeData> { return Promise.reject(unavailable()) }
}
