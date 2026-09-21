import { ArrowUpRight, BookOpen, FileText, Highlighter, Link2, Network, StickyNote, Trash2, Underline } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import type { Paper } from '../../types/paper'
import type { PaperAnnotation } from '../../types/annotation'
import { findNode } from '../../utils/tree'

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
}

const annotationLabels = { highlight: '高亮', underline: '下划线', note: '批注' }
const annotationIcons = {
  highlight: <Highlighter size={13} />,
  underline: <Underline size={13} />,
  note: <StickyNote size={13} />,
}

export function PaperSidebar({ paper, pageNumber, annotations, activeAnnotationId, onGoToAnnotation, onUpdateAnnotation, onDeleteAnnotation, onGenerateNode, onGoToNode }: PaperSidebarProps) {
  const [annotationScope, setAnnotationScope] = useState<'all' | 'page'>('all')
  const documents = useDocumentStore((state) => state.documents)
  const relations = usePaperStore((state) => state.relations)
  const annotationNodeRelations = usePaperStore((state) => state.annotationNodeRelations)
  const linkedNodes = useMemo(() => relations.filter((relation) => relation.paperId === paper.id).flatMap((relation) => {
    const document = documents.find((item) => item.id === relation.documentId)
    const node = document && findNode(document.root, relation.nodeId)
    return document && node ? [{ relation, document, node }] : []
  }), [documents, paper.id, relations])
  const generatedNodesByAnnotation = useMemo(() => {
    const result = new Map<string, Array<{ documentId: string; nodeId: string; documentTitle: string; nodeTitle: string }>>()
    for (const relation of annotationNodeRelations) {
      const document = documents.find((item) => item.id === relation.documentId)
      const node = document && findNode(document.root, relation.nodeId)
      if (!document || !node) continue
      const linked = result.get(relation.annotationId) ?? []
      linked.push({ documentId: document.id, nodeId: node.id, documentTitle: document.title, nodeTitle: node.title })
      result.set(relation.annotationId, linked)
    }
    return result
  }, [annotationNodeRelations, documents])
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
        <div className="paper-annotation-list">{visibleAnnotations.map((annotation) => <article key={annotation.id} className={annotation.id === activeAnnotationId ? 'active' : annotation.pageNumber === pageNumber ? 'current-page' : ''} onClick={() => onGoToAnnotation(annotation)}>
          <header><span>{annotationIcons[annotation.annotationType]}{annotationLabels[annotation.annotationType]} · 第 {annotation.pageNumber} 页</span><div><button title="生成思维导图节点" aria-label={`从标注生成节点 ${annotation.selectedText}`} onClick={(event) => { event.stopPropagation(); onGenerateNode(annotation) }}><Network size={12} /></button><button aria-label={`删除标注 ${annotation.selectedText}`} onClick={(event) => { event.stopPropagation(); onDeleteAnnotation(annotation) }}><Trash2 size={12} /></button></div></header>
          <blockquote>{annotation.selectedText}</blockquote>
          {(annotation.annotationType === 'note' || annotation.content) && <textarea defaultValue={annotation.content} placeholder="添加笔记…" rows={2} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (event.target.value !== annotation.content) onUpdateAnnotation(annotation, event.target.value) }} />}
          {(generatedNodesByAnnotation.get(annotation.id) ?? []).map((linkedNode) => <button key={`${linkedNode.documentId}-${linkedNode.nodeId}`} className="annotation-node-link" onClick={(event) => { event.stopPropagation(); onGoToNode(linkedNode.documentId, linkedNode.nodeId) }} aria-label={`打开已生成节点 ${linkedNode.nodeTitle}`}><Network size={11} /><span>已生成节点：{linkedNode.nodeTitle}</span><small>{linkedNode.documentTitle}</small><ArrowUpRight size={11} /></button>)}
        </article>)}</div>
        {!annotations.length && <p className="paper-sidebar-empty">选择 PDF 文字即可创建高亮、下划线或批注。</p>}
        {annotations.length > 0 && !visibleAnnotations.length && <p className="paper-sidebar-empty">当前页还没有标注。</p>}
      </section>
    </aside>
  )
}
