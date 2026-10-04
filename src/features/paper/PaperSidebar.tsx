import { ArrowUpRight, BookOpen, FileText, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import type { Paper } from '../../types/paper'
import type { PaperAnnotation } from '../../types/annotation'
import { findNode } from '../../utils/tree'
import { AnnotationCard } from './AnnotationCard'

interface PaperSidebarProps {
  paper: Paper
  pageNumber: number
  annotations: PaperAnnotation[]
  activeAnnotationId?: string
  onGoToAnnotation: (annotation: PaperAnnotation) => void
  onUpdateAnnotation: (annotation: PaperAnnotation, content: string) => void
  onDeleteAnnotation: (annotation: PaperAnnotation) => void
  onGenerateNode: (annotation: PaperAnnotation) => void
  onGoToNode: (documentId: string, nodeId: string) => void
  onLinkAnnotation: (annotation: PaperAnnotation) => void
  onQuickLink?: (annotation: PaperAnnotation) => void
  currentNodeTitle?: string
  readOnly?: boolean
  onEditArea: (annotation: PaperAnnotation) => void
}

export function PaperSidebar({ paper, pageNumber, annotations, activeAnnotationId, onGoToAnnotation, onGenerateNode, onGoToNode, onLinkAnnotation, onQuickLink, currentNodeTitle, readOnly, onEditArea }: PaperSidebarProps) {
  const [annotationScope, setAnnotationScope] = useState<'all' | 'page'>('all')
  const documents = useDocumentStore((state) => state.documents)
  const relations = usePaperStore((state) => state.relations)
  const linkedNodes = useMemo(() => relations.filter((relation) => relation.paperId === paper.id).flatMap((relation) => {
    const document = documents.find((item) => item.id === relation.documentId && !item.deletedAt)
    const node = document && findNode(document.root, relation.nodeId)
    return document && node ? [{ relation, document, node }] : []
  }), [documents, paper.id, relations])
  const visibleAnnotations = annotationScope === 'page'
    ? annotations.filter((annotation) => annotation.pageNumber === pageNumber)
    : annotations

  return (
    <aside className="paper-sidebar">
      <section>
        <p className="eyebrow">论文信息</p>
        <h2>{paper.title}</h2>
        <dl>
          <div><dt>文件</dt><dd>{paper.fileName}</dd></div>
          <div><dt>大小</dt><dd>{(paper.fileSize / 1024 / 1024).toFixed(2)} MB</dd></div>
          <div><dt>当前</dt><dd>第 {pageNumber} / {paper.pageCount || '—'} 页</dd></div>
        </dl>
      </section>
      <section>
        <div className="paper-sidebar-heading"><span><Link2 size={14} />关联节点</span><b>{linkedNodes.length}</b></div>
        <div className="linked-node-list">{linkedNodes.map(({ relation, document, node }) => <button key={relation.id} onClick={() => onGoToNode(document.id, node.id)} aria-label={`打开节点 ${node.title}`}><BookOpen size={14} /><span><strong>{node.title}</strong><small>{document.title}</small></span><ArrowUpRight size={12} /></button>)}</div>
        {!linkedNodes.length && <p className="paper-sidebar-empty">尚未关联思维导图节点。</p>}
      </section>
      <section>
        <div className="paper-sidebar-heading"><span><FileText size={14} />标注与笔记 <b>{annotations.length}</b></span><div className="annotation-scope"><button className={annotationScope === 'all' ? 'active' : ''} onClick={() => setAnnotationScope('all')}>全部</button><button className={annotationScope === 'page' ? 'active' : ''} onClick={() => setAnnotationScope('page')}>本页</button></div></div>
        <div className="paper-annotation-list">{visibleAnnotations.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} readOnly={readOnly} active={annotation.id === activeAnnotationId} onLocate={() => onGoToAnnotation(annotation)} onLink={() => onLinkAnnotation(annotation)} onQuickLink={onQuickLink ? () => onQuickLink(annotation) : undefined} currentNodeTitle={currentNodeTitle} onGenerate={() => onGenerateNode(annotation)} onGoToNode={onGoToNode} onEditArea={() => onEditArea(annotation)} />)}</div>
        {!annotations.length && <p className="paper-sidebar-empty">选择 PDF 文字即可创建高亮、下划线或批注。</p>}
        {annotations.length > 0 && !visibleAnnotations.length && <p className="paper-sidebar-empty">当前页还没有标注。</p>}
      </section>
    </aside>
  )
}
