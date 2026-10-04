import { useState } from 'react'
import { usePaperStore } from '../../stores/paperStore'
import { paperKnowledgeService } from '../../services/paper/paperKnowledgeService'
import { AnnotationCard } from './AnnotationCard'
import { LinkAnnotationDialog } from './LinkAnnotationDialog'
import { knowledgeAction } from '../../stores/knowledgeFeedbackStore'

export function NodeSources({ documentId, nodeId, nodeTitle, onOpen, onGoToNode, readOnly }: {
  documentId: string; nodeId: string; nodeTitle: string; onOpen: (paperId: string, annotationId?: string) => void
  onGoToNode: (documentId: string, nodeId: string) => void; readOnly?: boolean
}) {
  const { papers, relations, annotations, annotationNodeRelations } = usePaperStore()
  const [expanded, setExpanded] = useState(false)
  const [linking, setLinking] = useState<string[]>()
  const sources = annotationNodeRelations.filter((item) => item.documentId === documentId && item.nodeId === nodeId).flatMap((relation) => {
    const annotation = annotations.find((item) => item.id === relation.annotationId)
    const paper = annotation && papers.find((item) => item.id === annotation.paperId)
    return annotation && paper ? [{ relation, annotation, paper }] : []
  })
  const paperIds = new Set(relations.filter((item) => item.documentId === documentId && item.nodeId === nodeId).map((item) => item.paperId))
  const linkedPapers = papers.filter((paper) => paperIds.has(paper.id))
  if (!sources.length && !linkedPapers.length) return null
  return <aside className={`node-source-panel ${expanded ? 'expanded' : ''}`} aria-label="节点来源">
    <button className="source-panel-toggle" onClick={() => setExpanded((value) => !value)}><strong>📄 {sources.length} 条来源 · {linkedPapers.length} 篇论文</strong><span>{nodeTitle} {expanded ? '⌄' : '⌃'}</span></button>
    {expanded && <div className="node-source-content">{linkedPapers.map((paper) => <button className="source-paper-open" key={paper.id} onClick={() => onOpen(paper.id)}>分栏阅读 · {paper.title}</button>)}
      {sources.map(({ relation, annotation, paper }) => <div key={relation.id}><p>{paper.title}</p><AnnotationCard annotation={annotation} readOnly={readOnly} removable={false} onLocate={() => onOpen(paper.id, annotation.id)} onLink={() => setLinking([annotation.id])} onGoToNode={onGoToNode} />
        {!readOnly && <button className="unlink-source" aria-label={`解除来源 ${annotation.selectedText}`} onClick={() => void knowledgeAction(() => paperKnowledgeService.unlinkRelations([relation.id]), '已解除来源关联，原文批注保留', () => paperKnowledgeService.restoreRelations([relation.id]))}>解除这条关联</button>}
      </div>)}
    </div>}
    {linking && <LinkAnnotationDialog annotationIds={linking} defaultDocumentId={documentId} defaultNodeId={nodeId} onClose={() => setLinking(undefined)} />}
  </aside>
}
