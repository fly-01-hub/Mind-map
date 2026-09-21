import type { MindMapDocument, NodeData } from '../types/mindmap'

export interface SearchResult {
  documentId: string
  documentTitle: string
  nodeId: string
  nodeTitle: string
  field: 'title' | 'tag' | 'note'
  excerpt: string
}

export function searchDocuments(documents: MindMapDocument[], query: string): SearchResult[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return []
  const results: SearchResult[] = []
  const visit = (document: MindMapDocument, node: NodeData) => {
    const title = node.title.toLocaleLowerCase()
    const matchingTag = node.tags.find((tag) => tag.toLocaleLowerCase().includes(term))
    const noteIndex = node.note.toLocaleLowerCase().indexOf(term)
    if (title.includes(term)) results.push({ documentId: document.id, documentTitle: document.title, nodeId: node.id, nodeTitle: node.title, field: 'title', excerpt: node.title })
    else if (matchingTag) results.push({ documentId: document.id, documentTitle: document.title, nodeId: node.id, nodeTitle: node.title, field: 'tag', excerpt: `#${matchingTag}` })
    else if (noteIndex >= 0) results.push({ documentId: document.id, documentTitle: document.title, nodeId: node.id, nodeTitle: node.title, field: 'note', excerpt: node.note.slice(Math.max(0, noteIndex - 28), noteIndex + term.length + 48) })
    node.children.forEach((child) => visit(document, child))
  }
  documents.filter((document) => !document.deletedAt).forEach((document) => visit(document, document.root))
  return results.slice(0, 100)
}
