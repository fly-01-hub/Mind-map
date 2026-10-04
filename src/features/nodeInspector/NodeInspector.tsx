import {
  Bold, BookOpen, Check, Code2, ExternalLink, File, FileImage, FileText, Italic,
  Link2, Paperclip, Plus, Quote, Sigma, Table2, Tag, Trash2, Underline, Unlink, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { isPdfFile } from '../../repositories/paperRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { usePaperStore } from '../../stores/paperStore'
import { useUserStore } from '../../stores/userStore'
import type { Attachment, NodeData, TaskStatus } from '../../types/mindmap'
import { AttachmentViewer } from './AttachmentViewer'
import { rehypeWikiLinks } from '../documentLinks/rehypeWikiLinks'
import 'katex/dist/katex.min.css'

const colors = ['#ffffff', '#edf3ee', '#eef1f5', '#f6f0e8', '#f3ebef', '#f5eeee']
const icons = ['📄', '🔬', '💡', '⭐', '📌', '🧠', '📚', '⚠️']

function tableToText(table?: NodeData['table']): string {
  if (!table) return ''
  return [table.headers, ...table.rows].map((row) => row.join('\t')).join('\n')
}

function parseTable(value: string): NodeData['table'] | undefined {
  const rows = value.split(/\r?\n/).map((line) => {
    const cells = line.includes('\t') ? line.split('\t') : line.split('|')
    return cells.map((cell) => cell.trim()).filter((cell, index) => cell || (index > 0 && index < cells.length - 1))
  }).filter((row) => row.some(Boolean))
  if (!rows.length) return
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
  return { headers: normalized[0], rows: normalized.slice(1) }
}

function attachmentIcon(attachment: Attachment) {
  if (attachment.mimeType === 'application/pdf') return <FileText size={15} />
  if (attachment.mimeType.startsWith('image/')) return <FileImage size={15} />
  return <File size={15} />
}

export function NodeInspector({ node, documentId, close, focusNoteRequest, onOpenPaper, onOpenWikiLink }: { node?: NodeData; documentId: string; close: () => void; focusNoteRequest?: { nodeId: string; nonce: number }; onOpenPaper?: (paperId: string, annotationId?: string) => void; onOpenWikiLink?: (name: string) => void }) {
  const updateNode = useDocumentStore((state) => state.updateNode)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const paperInputRef = useRef<HTMLInputElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const [title, setTitle] = useState(node?.title ?? '')
  const [link, setLink] = useState(node?.hyperlink ?? '')
  const [note, setNote] = useState(node?.note ?? '')
  const [code, setCode] = useState(node?.code ?? '')
  const [formula, setFormula] = useState(node?.formula ?? '')
  const [tableText, setTableText] = useState(tableToText(node?.table))
  const [tagDraft, setTagDraft] = useState('')
  const [preview, setPreview] = useState(false)
  const [viewerAttachment, setViewerAttachment] = useState<Attachment>()
  const [selectedPaperId, setSelectedPaperId] = useState('')
  const userId = useUserStore((state) => state.id) ?? 'local-demo-user'
  const papers = usePaperStore((state) => state.papers)
  const relations = usePaperStore((state) => state.relations)
  const annotations = usePaperStore((state) => state.annotations)
  const annotationNodeRelations = usePaperStore((state) => state.annotationNodeRelations)
  const paperBusy = usePaperStore((state) => state.busy)
  const paperError = usePaperStore((state) => state.error)
  const uploadAndLink = usePaperStore((state) => state.uploadAndLink)
  const linkPaper = usePaperStore((state) => state.linkPaper)
  const unlinkPaper = usePaperStore((state) => state.unlinkPaper)

  useEffect(() => {
    if (!focusNoteRequest || focusNoteRequest.nodeId !== node?.id) return
    const frame = requestAnimationFrame(() => noteInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusNoteRequest, node?.id])

  const linkedPapers = useMemo(() => {
    if (!node) return []
    const linkedIds = new Set(relations.filter((relation) => relation.documentId === documentId && relation.nodeId === node.id).map((relation) => relation.paperId))
    return papers.filter((paper) => linkedIds.has(paper.id)).map((paper) => ({
      ...paper,
      annotationCount: annotations.filter((annotation) => annotation.paperId === paper.id).length,
    }))
  }, [annotations, documentId, node, papers, relations])
  const availablePapers = useMemo(() => {
    const linkedIds = new Set(linkedPapers.map((paper) => paper.id))
    return papers.filter((paper) => !linkedIds.has(paper.id))
  }, [linkedPapers, papers])
  const paperSources = useMemo(() => {
    if (!node) return []
    return annotationNodeRelations
      .filter((relation) => relation.documentId === documentId && relation.nodeId === node.id)
      .flatMap((relation) => {
        const annotation = annotations.find((item) => item.id === relation.annotationId)
        const paper = annotation && papers.find((item) => item.id === annotation.paperId)
        return annotation && paper ? [{ relation, annotation, paper }] : []
      })
      .sort((a, b) => a.annotation.pageNumber - b.annotation.pageNumber)
  }, [annotationNodeRelations, annotations, documentId, node, papers])

  if (!node) return (
    <aside className="node-inspector">
      <header><div><p className="eyebrow">节点详情</p><strong>未选择节点</strong></div><button className="icon-button" onClick={close} aria-label="关闭详情"><X size={18} /></button></header>
      <div className="inspector-empty">在画布中选择一个节点以查看和编辑详细内容。</div>
    </aside>
  )

  const patch = (value: Partial<NodeData>) => updateNode(node.id, value)
  const addTags = () => {
    const additions = tagDraft.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean)
    if (!additions.length) return
    patch({ tags: [...new Set([...node.tags, ...additions])] })
    setTagDraft('')
  }
  const addAttachments = async (files: FileList | File[]) => {
    const saved: Attachment[] = []
    try {
      for (const file of Array.from(files)) {
        if (isPdfFile(file)) await uploadAndLink(file, documentId, node.id, userId)
        else saved.push(await attachmentRepository.save(documentId, node.id, file))
      }
    } catch {
      return
    }
    if (!saved.length) return
    patch({ attachments: [...node.attachments, ...saved] })
  }
  const addPapers = async (files: FileList | File[]) => {
    try {
      for (const file of Array.from(files)) await uploadAndLink(file, documentId, node.id, userId)
    } catch {
      // The store exposes the user-facing error while preserving successful local uploads.
    }
  }
  const removeAttachment = async (attachment: Attachment) => {
    await attachmentRepository.softDelete(attachment.id)
    patch({ attachments: node.attachments.filter((item) => item.id !== attachment.id) })
  }

  return (
    <aside className="node-inspector">
      <header><div><p className="eyebrow">节点详情</p><strong>{node.title}</strong></div><button className="icon-button" onClick={close} aria-label="关闭详情"><X size={18} /></button></header>
      <div className="inspector-scroll">
        <section className="inspector-block">
          <label htmlFor="node-title">标题</label>
          <textarea id="node-title" className="inspector-input title-textarea" rows={2} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() && title !== node.title) patch({ title: title.trim(), richText: undefined }) }} />
          <div className="format-row">
            <button className={node.style.fontWeight === '700' ? 'active' : ''} aria-label="加粗" onClick={() => patch({ style: { ...node.style, fontWeight: node.style.fontWeight === '700' ? undefined : '700' } })}><Bold size={15} /></button>
            <button className={node.style.fontStyle === 'italic' ? 'active' : ''} aria-label="斜体" onClick={() => patch({ style: { ...node.style, fontStyle: node.style.fontStyle === 'italic' ? undefined : 'italic' } })}><Italic size={15} /></button>
            <button className={node.style.textDecoration === 'underline' ? 'active' : ''} aria-label="下划线" onClick={() => patch({ style: { ...node.style, textDecoration: node.style.textDecoration === 'underline' ? undefined : 'underline' } })}><Underline size={15} /></button>
          </div>
        </section>

        <div className="inspector-grid">
          <div><label htmlFor="task-status">状态</label><select id="task-status" value={node.taskStatus} onChange={(event) => patch({ taskStatus: event.target.value as TaskStatus })}><option value="none">无</option><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select></div>
          <div><label>下级</label><span>{node.children.length}</span></div>
        </div>

        <section className="inspector-block">
          <label><Tag size={12} />标签</label>
          <div className="tag-list">{node.tags.map((item) => <span key={item}>#{item}<button aria-label={`删除标签 ${item}`} onClick={() => patch({ tags: node.tags.filter((tag) => tag !== item) })}><X size={11} /></button></span>)}</div>
          <div className="inline-input"><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTags() } }} placeholder="输入标签后按 Enter" /><button onClick={addTags} aria-label="添加标签"><Plus size={15} /></button></div>
        </section>

        <section className="inspector-block">
          <label htmlFor="node-link"><Link2 size={12} />超链接</label>
          <div className="inline-input"><input id="node-link" type="url" value={link} onChange={(event) => setLink(event.target.value)} onBlur={() => patch({ hyperlink: link.trim() || undefined })} placeholder="https://…" />{node.hyperlink && <a href={node.hyperlink} target="_blank" rel="noreferrer" aria-label="打开链接"><ExternalLink size={14} /></a>}</div>
        </section>

        <section className="inspector-block">
          <div className="inspector-label-row"><label htmlFor="node-note">Markdown 笔记</label><button className="preview-toggle" onClick={() => setPreview((value) => !value)}>{preview ? '编辑' : '预览'}</button></div>
          {preview ? <div className="markdown-preview" onDoubleClick={(event) => {
            const name = (event.target as HTMLElement).closest<HTMLElement>('[data-wiki-name]')?.dataset.wikiName
            if (name) { event.preventDefault(); onOpenWikiLink?.(name) }
          }} onKeyDown={(event) => {
            const name = (event.target as HTMLElement).closest<HTMLElement>('[data-wiki-name]')?.dataset.wikiName
            if (name && event.key === 'Enter') { event.preventDefault(); onOpenWikiLink?.(name) }
          }}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeWikiLinks]}>{note || '*暂无笔记*'}</ReactMarkdown></div> : <textarea ref={noteInputRef} id="node-note" className="inspector-input note-textarea" rows={7} value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== node.note) patch({ note }) }} placeholder="记录摘要、想法或引用…" />}
        </section>

        <section className="inspector-block compact-block">
          <label htmlFor="node-formula"><Sigma size={12} />LaTeX 公式</label>
          <input id="node-formula" className="inspector-input" value={formula} onChange={(event) => setFormula(event.target.value)} onBlur={() => patch({ formula: formula || undefined })} placeholder="E = mc^2" />
          {formula && <div className="markdown-preview formula-preview"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{`$$${formula}$$`}</ReactMarkdown></div>}
        </section>

        <section className="inspector-block compact-block">
          <label htmlFor="node-code"><Code2 size={12} />代码</label>
          <textarea id="node-code" className="inspector-input code-textarea" rows={4} value={code} onChange={(event) => setCode(event.target.value)} onBlur={() => patch({ code: code || undefined })} placeholder="粘贴代码片段…" />
        </section>

        <section className="inspector-block compact-block">
          <label htmlFor="node-table"><Table2 size={12} />表格</label>
          <textarea id="node-table" className="inspector-input table-textarea" rows={4} value={tableText} onChange={(event) => setTableText(event.target.value)} onBlur={() => patch({ table: parseTable(tableText) })} placeholder={'列一\t列二\n内容 A\t内容 B'} />
          {node.table && <div className="node-table-preview"><table><thead><tr>{node.table.headers.map((header, index) => <th key={index}>{header}</th>)}</tr></thead><tbody>{node.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}
        </section>

        <section className="inspector-block">
          <label>节点颜色</label>
          <div className="color-row">{colors.map((color) => <button key={color} aria-label={`设置颜色 ${color}`} className={node.style.background === color ? 'active' : ''} style={{ background: color }} onClick={() => patch({ style: { ...node.style, background: color } })}>{node.style.background === color && <Check size={12} />}</button>)}</div>
        </section>

        <section className="inspector-block compact-block">
          <label>图标</label>
          <div className="icon-picker"><button className={!node.icon ? 'active' : ''} aria-label="清除图标" onClick={() => patch({ icon: undefined })}>无</button>{icons.map((icon) => <button key={icon} className={node.icon === icon ? 'active' : ''} aria-label={`设置图标 ${icon}`} onClick={() => patch({ icon })}>{icon}</button>)}</div>
        </section>

        {paperSources.length > 0 && <section className="inspector-block paper-sources-block">
          <label><Quote size={12} />论文来源 · {paperSources.length}</label>
          {onOpenPaper && <button className="preview-toggle" onClick={() => onOpenPaper(paperSources[0].paper.id, paperSources[0].annotation.id)}>在导图旁定位原文</button>}
          <div className="paper-source-list">{paperSources.map(({ relation, annotation, paper }) => <button key={relation.id} onClick={() => navigate(`/paper/${paper.id}?documentId=${encodeURIComponent(documentId)}&nodeId=${encodeURIComponent(node.id)}&page=${annotation.pageNumber}&annotationId=${encodeURIComponent(annotation.id)}`)} aria-label={`打开来源 ${paper.title} 第 ${annotation.pageNumber} 页`}>
            <span><strong>{paper.title}</strong><small>第 {annotation.pageNumber} 页 · 点击定位原文</small></span>
            <blockquote>{annotation.selectedText}</blockquote>
          </button>)}</div>
        </section>}

        <section className="inspector-block papers-block">
          <div className="inspector-label-row"><label><BookOpen size={12} />文献 · {linkedPapers.length}</label><button className="preview-toggle" disabled={paperBusy} onClick={() => paperInputRef.current?.click()}>{paperBusy ? '保存中…' : '上传 PDF'}</button></div>
          <input ref={paperInputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => { if (event.target.files) void addPapers(event.target.files); event.target.value = '' }} />
          <div className="attachment-list">{linkedPapers.map((paper) => <div key={paper.id} className="attachment-row paper-row"><button className="attachment-open" onClick={() => navigate(`/paper/${paper.id}?documentId=${encodeURIComponent(documentId)}&nodeId=${encodeURIComponent(node.id)}`)}><FileText size={15} /><span><strong>{paper.title}</strong><small>{paper.pageCount ? `${paper.pageCount} 页 · ` : '页数待读取 · '}{paper.annotationCount} 条标注 · {(paper.fileSize / 1024 / 1024).toFixed(1)} MB</small></span></button><button className="icon-button" aria-label={`解除关联 ${paper.title}`} title="解除当前节点关联，不删除论文" onClick={() => void unlinkPaper(documentId, node.id, paper.id, userId)}><Unlink size={14} /></button></div>)}</div>
          {!linkedPapers.length && <button className="attachment-drop" disabled={paperBusy} onClick={() => paperInputRef.current?.click()}><BookOpen size={17} /><span>上传 PDF 并关联当前节点</span></button>}
          {availablePapers.length > 0 && <div className="paper-link-existing"><select aria-label="选择已有论文" value={selectedPaperId} onChange={(event) => setSelectedPaperId(event.target.value)}><option value="">关联已有论文…</option>{availablePapers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select><button disabled={!selectedPaperId} onClick={() => { if (!selectedPaperId) return; void linkPaper(documentId, node.id, selectedPaperId, userId).then(() => setSelectedPaperId('')) }}><Plus size={14} />关联</button></div>}
          {paperError && <p className="paper-error">{paperError}</p>}
        </section>

        <section className="inspector-block attachments-block">
          <div className="inspector-label-row"><label><Paperclip size={12} />附件</label><button className="preview-toggle" onClick={() => fileInputRef.current?.click()}>添加</button></div>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) void addAttachments(event.target.files); event.target.value = '' }} />
          <div className="attachment-list">{node.attachments.map((attachment) => <div key={attachment.id} className="attachment-row"><button className="attachment-open" onClick={() => setViewerAttachment(attachment)}>{attachmentIcon(attachment)}<span><strong>{attachment.fileName}</strong><small>{(attachment.size / 1024).toFixed(1)} KB</small></span></button><button className="icon-button" aria-label={`删除附件 ${attachment.fileName}`} onClick={() => void removeAttachment(attachment)}><Trash2 size={14} /></button></div>)}</div>
          {!node.attachments.length && <button className="attachment-drop" onClick={() => fileInputRef.current?.click()}><Paperclip size={17} /><span>添加图片或其他文件</span></button>}
        </section>
      </div>
      <AttachmentViewer attachment={viewerAttachment} onClose={() => setViewerAttachment(undefined)} />
    </aside>
  )
}
