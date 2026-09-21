import { Copy, Highlighter, Network, StickyNote, Underline, X } from 'lucide-react'
import { useState } from 'react'
import type { PaperAnnotationType, PdfTextSelection } from '../../types/annotation'

interface AnnotationToolbarProps {
  selection: PdfTextSelection
  onCreate: (type: PaperAnnotationType, content?: string) => Promise<void>
  onGenerate: () => void
  onClose: () => void
}

export function AnnotationToolbar({ selection, onCreate, onGenerate, onClose }: AnnotationToolbarProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const left = Math.min(window.innerWidth - 300, Math.max(300, selection.anchor.left))
  const top = Math.max(70, selection.anchor.top - (noteOpen ? 150 : 51))
  const save = async (type: PaperAnnotationType, content = '') => {
    setSaving(true)
    try { await onCreate(type, content) } catch { /* Keep the selection open so the user can retry. */ } finally { setSaving(false) }
  }
  const copySelection = async () => {
    try { await navigator.clipboard.writeText(selection.selectedText) } catch { /* Clipboard permission can be denied by the browser. */ }
  }

  return (
    <div className={`annotation-toolbar ${noteOpen ? 'with-note' : ''}`} style={{ left, top }} onPointerDown={(event) => event.preventDefault()}>
      {noteOpen && <div className="annotation-note-editor">
        <strong>添加批注</strong>
        <textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录你的理解或疑问…" rows={3} />
        <div><button onClick={() => setNoteOpen(false)}>取消</button><button disabled={saving || !note.trim()} onClick={() => void save('note', note.trim())}>保存批注</button></div>
      </div>}
      {!noteOpen && <div className="annotation-toolbar-actions">
        <button disabled={saving} onClick={() => void save('highlight')}><Highlighter size={14} />高亮</button>
        <button disabled={saving} onClick={() => void save('underline')}><Underline size={14} />下划线</button>
        <button disabled={saving} onClick={() => setNoteOpen(true)}><StickyNote size={14} />批注</button>
        <button onClick={onGenerate}><Network size={14} />生成节点</button>
        <button onClick={() => void copySelection()}><Copy size={14} />复制</button>
        <button className="annotation-close" onClick={onClose} aria-label="关闭标注工具栏"><X size={14} /></button>
      </div>}
    </div>
  )
}
