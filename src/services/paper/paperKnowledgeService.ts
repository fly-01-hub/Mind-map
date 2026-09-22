import { appDatabase } from '../../db/appDatabase'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import { useSaveStore } from '../../stores/saveStore'
import type { PaperAnnotation } from '../../types/annotation'
import type { Paper } from '../../types/paper'
import { createNode, findNode, insertChild } from '../../utils/tree'

interface CreatePaperNodeInput {
  paper: Paper
  annotation: PaperAnnotation
  documentId: string
  parentNodeId: string
  title: string
  note: string
  userId: string
}

function nodeNote(paper: Paper, annotation: PaperAnnotation, note: string) {
  const lines = [
    `> ${annotation.selectedText}`,
    '',
    `**来源：** ${paper.title} · Page ${annotation.pageNumber}`,
  ]
  if (note.trim()) lines.push('', '**我的笔记：**', note.trim())
  return lines.join('\n')
}

export const paperKnowledgeService = {
  async createNode(input: CreatePaperNodeInput) {
    const state = useDocumentStore.getState()
    const document = state.documents.find((item) => item.id === input.documentId && !item.deletedAt)
    if (!document) throw new Error('目标思维导图不存在。')
    if (!findNode(document.root, input.parentNodeId)) throw new Error('目标父节点不存在。')

    const timestamp = new Date().toISOString()
    const node = createNode(input.title.trim() || input.annotation.selectedText.slice(0, 60))
    node.note = nodeNote(input.paper, input.annotation, input.note)
    const updatedDocument = {
      ...document,
      root: insertChild(document.root, input.parentNodeId, node),
      version: document.version + 1,
      updatedAt: timestamp,
    }
    const annotationRelation = {
      id: crypto.randomUUID(), annotationId: input.annotation.id,
      documentId: document.id, nodeId: node.id, createdAt: timestamp,
    }
    const paperRelation = {
      id: crypto.randomUUID(), documentId: document.id,
      nodeId: node.id, paperId: input.paper.id, createdAt: timestamp,
    }
    const updatedAnnotation = input.annotation.content === input.note ? input.annotation : {
      ...input.annotation, content: input.note, updatedAt: timestamp,
    }

    await appDatabase.transaction(
      'rw',
      [appDatabase.documents, appDatabase.paperAnnotations, appDatabase.nodePaperRelations, appDatabase.annotationNodeRelations],
      async () => {
        await appDatabase.documents.put(structuredClone(updatedDocument))
        await appDatabase.paperAnnotations.put(updatedAnnotation)
        await appDatabase.nodePaperRelations.add(paperRelation)
        await appDatabase.annotationNodeRelations.add(annotationRelation)
      },
    )

    const history = state.histories[document.id] ?? { past: [], future: [] }
    useDocumentStore.setState((latest) => ({
      documents: latest.documents.map((item) => item.id === document.id ? updatedDocument : item),
      histories: {
        ...latest.histories,
        [document.id]: { past: [...history.past, structuredClone(document.root)].slice(-50), future: [] },
      },
    }))
    useSaveStore.getState().markLocal()
    await usePaperStore.getState().refresh()
    return { node, annotationRelation, paperRelation }
  },
}
