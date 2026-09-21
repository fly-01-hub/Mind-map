import type { PaperAIProvider } from './PaperAIProvider'

const unavailable = () => Promise.reject(new Error('论文 AI 功能尚未启用。'))

export const mockPaperAIProvider: PaperAIProvider = {
  summarizePaper: unavailable,
  extractConcepts: unavailable,
  generateMindMapFromPaper: unavailable,
  explainSelection: unavailable,
}
