import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePaperStore } from '../../stores/paperStore'
import { useDocumentStore } from '../../stores/documentStore'
import { findNode } from '../../utils/tree'
import { paperRepository } from '../../repositories/paperRepository'
import { AnnotationCard } from './AnnotationCard'
import { annotationColors } from '../../services/paper/paperKnowledgeService'
import { LinkAnnotationDialog } from './LinkAnnotationDialog'
import { KnowledgeFeedback } from './knowledgeFeedback'
import { knowledgeAction } from '../../stores/knowledgeFeedbackStore'
import './paper-knowledge.css'

export function AnnotationsPage() {
  const navigate = useNavigate()
  const { annotations, papers, annotationNodeRelations, refresh } = usePaperStore()
  const documents = useDocumentStore((state) => state.documents)
  const [query, setQuery] = useState('')
  const [paperId, setPaperId] = useState('')
  const [color, setColor] = useState('')
  const [tag, setTag] = useState('')
  const [unlinked, setUnlinked] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [linking, setLinking] = useState<string[]>()
  const inputRef = useRef<HTMLInputElement>(null)
  const liveLinked = useMemo(() => new Set(annotationNodeRelations.filter((relation) => {
    const document = documents.find((item) => item.id === relation.documentId && !item.deletedAt)
    return document && findNode(document.root, relation.nodeId)
  }).map((item) => item.annotationId)), [annotationNodeRelations, documents])
  const tags = [...new Set(annotations.flatMap((item) => item.tags ?? []))].sort()
  const visible = annotations.filter((item) => papers.some((paper) => paper.id === item.paperId) && (!paperId || item.paperId === paperId) && (!color || (item.color ?? 'yellow') === color) && (!tag || item.tags?.includes(tag)) && (!unlinked || !liveLinked.has(item.id)) && [item.selectedText, item.content, ...(item.tags ?? []), papers.find((paper) => paper.id === item.paperId)?.title ?? ''].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const selectedVisible = visible.filter((item) => selected.includes(item.id)).map((item) => item.id)
  return <main className="annotations-page"><header><div><button onClick={() => navigate('/library')}>← 返回知识库</button><h1>论文与批注</h1><p>本地 PDF、原文摘录与导图引用 · {papers.length} 篇论文 / {annotations.length} 条批注</p></div><button className="primary-button" onClick={() => inputRef.current?.click()}>导入 PDF</button>
    <input ref={inputRef} hidden multiple type="file" accept="application/pdf,.pdf" onChange={(event) => {
      const files = [...event.target.files ?? []]; event.target.value = ''
      void knowledgeAction(async () => { for (const file of files) await paperRepository.createOrReuse(file, 'local-demo-user'); await refresh() }, 'PDF 已保存到本地论文库')
    }} /></header>
    <div className="knowledge-filters"><input aria-label="搜索批注" placeholder="搜索原文、笔记、标签或论文…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="筛选论文" value={paperId} onChange={(event) => setPaperId(event.target.value)}><option value="">全部论文</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select>
      <select aria-label="筛选颜色" value={color} onChange={(event) => setColor(event.target.value)}><option value="">全部颜色</option>{annotationColors.map((item, index) => <option key={item} value={item}>{['黄色', '红色', '绿色', '蓝色', '紫色'][index]}</option>)}</select>
      <select aria-label="筛选标签" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">全部标签</option>{tags.map((item) => <option key={item}>{item}</option>)}</select>
      <label><input type="checkbox" checked={unlinked} onChange={(event) => setUnlinked(event.target.checked)} />仅未关联</label></div>
    <div className="knowledge-paper-list">{papers.map((paper) => <button key={paper.id} onClick={() => navigate(`/paper/${paper.id}`)}>📄 {paper.title}<small>{annotations.filter((item) => item.paperId === paper.id).length} 条批注</small></button>)}</div>
    <div className="knowledge-batch-bar"><label><input type="checkbox" checked={visible.length > 0 && selectedVisible.length === visible.length} onChange={(event) => setSelected(event.target.checked ? visible.map((item) => item.id) : [])} />全选当前结果 ({visible.length})</label><button disabled={!selectedVisible.length} onClick={() => setLinking(selectedVisible)}>批量关联 {selectedVisible.length} 条批注</button></div>
    <div className="knowledge-card-grid">{visible.map((annotation) => <div key={annotation.id}><label className="knowledge-card-selection"><input type="checkbox" aria-label={`选择批注 ${annotation.selectedText}`} checked={selected.includes(annotation.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, annotation.id] : ids.filter((id) => id !== annotation.id))} />{papers.find((paper) => paper.id === annotation.paperId)?.title}</label><AnnotationCard annotation={annotation} onLocate={() => navigate(`/paper/${annotation.paperId}?annotationId=${encodeURIComponent(annotation.id)}`)} onLink={() => setLinking([annotation.id])} onGoToNode={(documentId, nodeId) => navigate(`/map/${documentId}?nodeId=${encodeURIComponent(nodeId)}`)} /></div>)}</div>
    {!visible.length && <p className="knowledge-empty">暂无符合条件的批注。打开论文，选中文字或框选图表后即可标注。</p>}
    {linking && <LinkAnnotationDialog annotationIds={linking} onClose={() => setLinking(undefined)} />}<KnowledgeFeedback />
  </main>
}
