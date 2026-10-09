import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'

const colors = [
  { name: '红色', value: '#b2473e' },
  { name: '橙色', value: '#b96224' },
  { name: '黄色', value: '#9a6d00' },
  { name: '绿色', value: '#39704d' },
  { name: '蓝色', value: '#356a8a' },
  { name: '紫色', value: '#76518f' },
]

type TextSelection = { editor: HTMLElement; range: Range; left: number; top: number }

// The map and outline share sanitized richText. Use native formatting so only
// the selected characters change and the editor's typing/undo history survives.
export function MindMapTextToolbar({ hostRef, enabled }: { hostRef: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const [selection, setSelection] = useState<TextSelection>()
  const selectionRef = useRef<TextSelection | undefined>(undefined)

  useEffect(() => {
    const host = hostRef.current
    if (!enabled || !host) return
    let frame = 0
    let composing = false
    const update = () => {
      frame = 0
      const editor = host.querySelector<HTMLElement>('#input-box[contenteditable="true"]')
      const native = window.getSelection()
      const range = native?.rangeCount ? native.getRangeAt(0) : undefined
      if (composing || !editor || document.activeElement !== editor || !range || range.collapsed
        || !editor.contains(range.startContainer) || !editor.contains(range.endContainer) || !range.toString().trim()) {
        selectionRef.current = undefined
        setSelection(undefined)
        return
      }
      const rect = range.getBoundingClientRect()
      const width = Math.min(300, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(rect.top >= 56 ? rect.top - 48 : rect.bottom + 8, window.innerHeight - 48))
      const next = { editor, range: range.cloneRange(), left, top }
      selectionRef.current = next
      setSelection(next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const startComposition = () => { composing = true; selectionRef.current = undefined; schedule() }
    const endComposition = () => { composing = false; schedule() }
    const observer = new MutationObserver(schedule)
    observer.observe(host, { childList: true, subtree: true })
    document.addEventListener('selectionchange', schedule)
    host.addEventListener('input', schedule)
    host.addEventListener('focusout', schedule)
    host.addEventListener('blur', schedule, true)
    host.addEventListener('compositionstart', startComposition)
    host.addEventListener('compositionend', endComposition)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      selectionRef.current = undefined
      document.removeEventListener('selectionchange', schedule)
      host.removeEventListener('input', schedule)
      host.removeEventListener('focusout', schedule)
      host.removeEventListener('blur', schedule, true)
      host.removeEventListener('compositionstart', startComposition)
      host.removeEventListener('compositionend', endComposition)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [enabled, hostRef])

  const applyColor = (color?: string) => {
    const saved = selectionRef.current
    if (!enabled || !saved || !saved.editor.isConnected || !hostRef.current?.contains(saved.editor)
      || !saved.editor.contains(saved.range.startContainer) || !saved.editor.contains(saved.range.endContainer)
      || saved.range.collapsed) return
    saved.editor.focus({ preventScroll: true })
    const native = window.getSelection()
    native?.removeAllRanges()
    native?.addRange(saved.range)
    document.execCommand('foreColor', false, color ?? getComputedStyle(saved.editor).color)
  }

  if (!enabled || !selection) return null
  return <div className="mindmap-text-toolbar" role="toolbar" aria-label="选中文字颜色"
    style={{ left: selection.left, top: selection.top }} onPointerDown={(event) => event.preventDefault()}>
    <span>文字颜色</span>
    {colors.map((color) => <button key={color.value} type="button" aria-label={`${color.name}文字`} title={`${color.name}文字`}
      onClick={() => applyColor(color.value)}><i style={{ backgroundColor: color.value }} /></button>)}
    <button type="button" aria-label="恢复正文颜色" title="恢复正文颜色（保留加粗等格式）" onClick={() => applyColor()}><RotateCcw size={15} /></button>
  </div>
}
