import { Copy, Highlighter, Network, StickyNote, Underline, X } from 'lucide-react'
import { useState } from 'react'
import type { AnnotationColor, PaperAnnotationType, PdfTextSelection } from '../../types/annotation'
import { annotationColors } from '../../services/paper/paperKnowledgeService'

interface AnnotationToolbarProps {
  selection: PdfTextSelection
  onCreate: (type: PaperAnnotationType, content?: string, color?: AnnotationColor) => Promise<void>
  onLink?: (color: AnnotationColor) => void
  onGenerate: (color: AnnotationColor) => void
  onClose: () => void
  editingArea?: boolean
  defaultColor?: AnnotationColor
}

export function AnnotationToolbar({ selection, onCreate, onGenerate, onClose, onLink, editingArea, defaultColor }: AnnotationToolbarProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [color, setColor] = useState<AnnotationColor>(defaultColor ?? 'yellow')
  const [error, setError] = useState('')
  const half = Math.min(290, (window.innerWidth - 24) / 2)
  const left = Math.min(window.innerWidth - half - 12, Math.max(half + 12, selection.anchor.left))
  const top = Math.min(window.innerHeight - (noteOpen ? 220 : 130), Math.max(70, selection.anchor.top - (noteOpen ? 220 : 110)))
  const save = async (type: PaperAnnotationType, content = '') => {
    setSaving(true)
    setError('')
    try { await onCreate(selection.kind === 'area' ? 'area' : type, content, color) } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') } finally { setSaving(false) }
  }
  const copySelection = async () => {
    try { await navigator.clipboard.writeText(selection.selectedText) } catch { /* Clipboard permission can be denied by the browser. */ }
  }

  return (
    <div className={`annotation-toolbar ${noteOpen ? 'with-note' : ''}`} style={{ left, top }} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('textarea, input, select')) event.preventDefault() }}>
      {!noteOpen && <div className="annotation-color-options" aria-label="标注颜色">{annotationColors.map((item) => <button key={item} data-color={item} aria-label={`选择${item}颜色`} aria-pressed={color === item} onClick={() => setColor(item)} />)}</div>}
      {noteOpen && <div className="annotation-note-editor">
        <strong>添加批注</strong>
        <textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录你的理解或疑问…" rows={3} />
        <div><button onClick={() => setNoteOpen(false)}>取消</button><button disabled={saving || !note.trim()} onClick={() => void save('note', note.trim())}>保存批注</button></div>
      </div>}
      {!noteOpen && <div className="annotation-toolbar-actions">
        <button disabled={saving} onClick={() => void save('highlight')}><Highlighter size={14} />{selection.kind === 'area' ? selection.areaStyle === 'highlight' ? '保存区域高亮' : '保存区域' : '高亮'}</button>
        {selection.kind !== 'area' && <button disabled={saving} onClick={() => void save('underline')}><Underline size={14} />下划线</button>}
        {!editingArea && <><button disabled={saving} onClick={() => setNoteOpen(true)}><StickyNote size={14} />批注</button>
        <button onClick={() => onGenerate(color)}><Network size={14} />生成节点</button>
        {onLink && <button disabled={saving} onClick={() => onLink(color)}>关联已有节点</button>}
        <button onClick={() => void copySelection()}><Copy size={14} />复制</button></>}
        <button className="annotation-close" onClick={onClose} aria-label="关闭标注工具栏"><X size={14} /></button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
