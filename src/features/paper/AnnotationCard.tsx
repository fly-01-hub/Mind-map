import { Copy, Link2, Network, Trash2, Scan } from 'lucide-react'
import { useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import { findNode } from '../../utils/tree'
import type { AnnotationColor, PaperAnnotation } from '../../types/annotation'
import { ANNOTATION_DRAG_TYPE, annotationReference, annotationColors, annotationLabels } from '../../services/paper/paperKnowledgeService'
import { knowledgeAction } from '../../stores/knowledgeFeedbackStore'
import './paper-knowledge.css'

export function AnnotationCard({ annotation, active, onLocate, onLink, onGenerate, onGoToNode, removable = true, readOnly = false, onQuickLink, currentNodeTitle, onEditArea }: {
  annotation: PaperAnnotation; active?: boolean; onLocate: () => void; onLink: () => void
  onGenerate?: () => void; onGoToNode: (documentId: string, nodeId: string) => void; removable?: boolean; readOnly?: boolean
  onQuickLink?: () => void; currentNodeTitle?: string
  onEditArea?: () => void
}) {
  const documents = useDocumentStore((state) => state.documents)
  const relations = usePaperStore((state) => state.annotationNodeRelations)
  const paperStore = usePaperStore()
  const tagText = (annotation.tags ?? []).join(', ')
  const [content, setContent] = useState(annotation.content)
  const [tags, setTags] = useState(tagText)
  const [lastContent, setLastContent] = useState(annotation.content)
  const [lastTags, setLastTags] = useState(tagText)
  if (annotation.content !== lastContent) { setLastContent(annotation.content); setContent(annotation.content) }
  if (tagText !== lastTags) { setLastTags(tagText); setTags(tagText) }
  const linked = relations.filter((item) => item.annotationId === annotation.id).flatMap((relation) => {
    const document = documents.find((item) => item.id === relation.documentId && !item.deletedAt)
    const node = document && findNode(document.root, relation.nodeId)
    return node ? [{ relation, node, document: document! }] : []
  })
  const deleteAnnotation = () => {
    if (linked.length && !window.confirm(`此批注被 ${linked.length} 个节点引用。删除后来源卡片将隐藏，节点与笔记保留；可撤销。确认删除？`)) return
    void knowledgeAction(() => paperStore.deleteAnnotation(annotation.id, annotation.userId), '已删除批注，节点与笔记保留', () => paperStore.restoreAnnotation(annotation.id))
  }
  return <article className={`knowledge-annotation-card ${active ? 'active' : ''}`} data-annotation-card={annotation.id} data-color={annotation.color ?? 'yellow'}>
    <header><button className="annotation-drag-handle" draggable title="拖动到导图节点以建立引用" aria-label={`拖动批注 ${annotation.selectedText}`} onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(ANNOTATION_DRAG_TYPE, annotation.id); event.dataTransfer.setData('text/plain', annotationReference(annotation.id))
    }}>{annotation.areaStyle === 'highlight' ? '区域高亮' : annotationLabels[annotation.annotationType]} · 第 {annotation.pageNumber} 页 ⠿</button><div>
      <button title="复制引用，粘贴到节点可关联" aria-label="复制批注引用" onClick={() => void knowledgeAction(() => navigator.clipboard.writeText(annotationReference(annotation.id)), '引用已复制；选中目标节点后粘贴即可关联')}><Copy size={13} /></button>
      {!readOnly && <button title="关联已有节点" aria-label={`关联批注 ${annotation.selectedText}`} onClick={onLink}><Link2 size={13} /></button>}
      {onGenerate && !readOnly && <button title="生成思维导图节点" aria-label={`从标注生成节点 ${annotation.selectedText}`} onClick={onGenerate}><Network size={13} /></button>}
      {annotation.annotationType === 'area' && onEditArea && !readOnly && <button aria-label="重新框选区域" title="重新框选，保留原有节点关联" onClick={onEditArea}><Scan size={13} /></button>}
      {removable && !readOnly && <button aria-label={`删除标注 ${annotation.selectedText}`} onClick={deleteAnnotation}><Trash2 size={13} /></button>}
    </div></header>
    <button className="annotation-excerpt" onClick={onLocate} title="定位 PDF 原文">{annotation.previewImage && <img src={annotation.previewImage} alt={`第 ${annotation.pageNumber} 页区域批注`} />}<blockquote>{annotation.selectedText || '图表 / 区域批注'}</blockquote></button>
    {onQuickLink && !readOnly && <button className="source-paper-open" title={currentNodeTitle} onClick={onQuickLink}>关联当前节点 · {currentNodeTitle}</button>}
    <textarea aria-label="批注笔记" readOnly={readOnly} value={content} placeholder="添加对这条原文的理解…" rows={2} onChange={(event) => setContent(event.target.value)} onBlur={() => {
      if (content !== annotation.content) void knowledgeAction(() => paperStore.updateAnnotationContent(annotation.id, content, annotation.userId), '批注笔记已保存')
    }} />
    <div className="annotation-metadata"><select aria-label="批注颜色" disabled={readOnly} value={annotation.color ?? 'yellow'} onChange={(event) => void knowledgeAction(() => paperStore.updateAnnotationMetadata(annotation.id, { color: event.target.value as AnnotationColor }), '颜色已保存')}>{annotationColors.map((color, index) => <option key={color} value={color}>{['黄色', '红色', '绿色', '蓝色', '紫色'][index]}</option>)}</select>
      <input aria-label="批注标签" readOnly={readOnly} value={tags} placeholder="标签，逗号分隔" onChange={(event) => setTags(event.target.value)} onBlur={() => {
        const next = [...new Set(tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))]
        if (JSON.stringify(next) !== JSON.stringify(annotation.tags ?? [])) void knowledgeAction(() => paperStore.updateAnnotationMetadata(annotation.id, { tags: next }), '标签已保存')
      }} /></div>
    {linked.map(({ relation, node, document }) => <button key={relation.id} className="annotation-node-link" title={document.title} aria-label={`打开已生成节点 ${node.title}`} onClick={() => onGoToNode(document.id, node.id)}><Network size={12} /><span>关联节点：{node.title}</span><small>{document.title}</small></button>)}
  </article>
}
