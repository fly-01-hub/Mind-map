import {
  Bold, Check, Code2, ExternalLink, File, FileImage, FileText, Italic,
  Link2, Paperclip, Plus, Sigma, Tag, Trash2, Underline, X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import type { Attachment, NodeData, TaskStatus } from '../../types/mindmap'
import { AttachmentViewer } from './AttachmentViewer'
import 'katex/dist/katex.min.css'

const colors = ['#ffffff', '#edf3ee', '#eef1f5', '#f6f0e8', '#f3ebef', '#f5eeee']
const icons = ['📄', '🔬', '💡', '⭐', '📌', '🧠', '📚', '⚠️']

function attachmentIcon(attachment: Attachment) {
  if (attachment.mimeType === 'application/pdf') return <FileText size={15} />
  if (attachment.mimeType.startsWith('image/')) return <FileImage size={15} />
  return <File size={15} />
}

export function NodeInspector({ node, documentId, close }: { node?: NodeData; documentId: string; close: () => void }) {
  const updateNode = useDocumentStore((state) => state.updateNode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(node?.title ?? '')
  const [link, setLink] = useState(node?.hyperlink ?? '')
  const [note, setNote] = useState(node?.note ?? '')
  const [code, setCode] = useState(node?.code ?? '')
  const [formula, setFormula] = useState(node?.formula ?? '')
  const [tagDraft, setTagDraft] = useState('')
  const [preview, setPreview] = useState(false)
  const [viewerAttachment, setViewerAttachment] = useState<Attachment>()

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
    for (const file of Array.from(files)) saved.push(await attachmentRepository.save(documentId, node.id, file))
    patch({ attachments: [...node.attachments, ...saved] })
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
          <textarea id="node-title" className="inspector-input title-textarea" rows={2} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() && title !== node.title) patch({ title: title.trim() }) }} />
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
          {preview ? <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{note || '*暂无笔记*'}</ReactMarkdown></div> : <textarea id="node-note" className="inspector-input note-textarea" rows={7} value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== node.note) patch({ note }) }} placeholder="记录摘要、想法或引用…" />}
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

        <section className="inspector-block">
          <label>节点颜色</label>
          <div className="color-row">{colors.map((color) => <button key={color} aria-label={`设置颜色 ${color}`} className={node.style.background === color ? 'active' : ''} style={{ background: color }} onClick={() => patch({ style: { ...node.style, background: color } })}>{node.style.background === color && <Check size={12} />}</button>)}</div>
        </section>

        <section className="inspector-block compact-block">
          <label>图标</label>
          <div className="icon-picker"><button className={!node.icon ? 'active' : ''} aria-label="清除图标" onClick={() => patch({ icon: undefined })}>无</button>{icons.map((icon) => <button key={icon} className={node.icon === icon ? 'active' : ''} aria-label={`设置图标 ${icon}`} onClick={() => patch({ icon })}>{icon}</button>)}</div>
        </section>

        <section className="inspector-block attachments-block">
          <div className="inspector-label-row"><label><Paperclip size={12} />附件</label><button className="preview-toggle" onClick={() => fileInputRef.current?.click()}>添加</button></div>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) void addAttachments(event.target.files); event.target.value = '' }} />
          <div className="attachment-list">{node.attachments.map((attachment) => <div key={attachment.id} className="attachment-row"><button className="attachment-open" onClick={() => setViewerAttachment(attachment)}>{attachmentIcon(attachment)}<span><strong>{attachment.fileName}</strong><small>{(attachment.size / 1024).toFixed(1)} KB</small></span></button><button className="icon-button" aria-label={`删除附件 ${attachment.fileName}`} onClick={() => void removeAttachment(attachment)}><Trash2 size={14} /></button></div>)}</div>
          {!node.attachments.length && <button className="attachment-drop" onClick={() => fileInputRef.current?.click()}><Paperclip size={17} /><span>添加 PDF、图片或文件</span></button>}
        </section>
      </div>
      <AttachmentViewer attachment={viewerAttachment} onClose={() => setViewerAttachment(undefined)} />
    </aside>
  )
}
