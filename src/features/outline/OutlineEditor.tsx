import {
  Bold, Braces, Check, ChevronDown, ChevronRight, Circle, ClipboardPaste, Code, Copy, ExternalLink,
  EyeOff, FileCode2, GripVertical, Highlighter, Italic, Link2, ListChecks, Paperclip,
  Plus, Scissors, Sigma, StickyNote, Strikethrough, Table2, Trash2, Underline, UnfoldVertical,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { useSelectionStore } from '../../stores/selectionStore'
import type { NodeData } from '../../types/mindmap'
import { compactRichText, plainTextFromRichText, richTextFromPlain, sanitizeRichText } from '../../utils/richText'
import { findParent } from '../../utils/tree'
import { clearWikiEditor, highlightWikiEditor, wikiLinkAtPoint } from '../../utils/wikiLinks'
import { DocumentTitleInput } from '../documentLinks/DocumentTitleInput'
import { WikiText } from '../documentLinks/WikiText'

interface VisibleNode { node: NodeData; depth: number; number: string }
type DropPosition = 'before' | 'inside' | 'after'
interface FormatSelection { nodeId: string; range: Range; left: number; top: number }

function flattenVisible(nodes: NodeData[], depth = 0, result: VisibleNode[] = [], prefix = ''): VisibleNode[] {
  nodes.forEach((node, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1)
    result.push({ node, depth, number })
    if (!node.collapsed) flattenVisible(node.children, depth + 1, result, number)
  })
  return result
}

function selectedOffsets(editor: HTMLElement): { start: number; end: number; range?: Range } {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return { start: 0, end: 0 }
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return { start: 0, end: 0 }
  const before = document.createRange()
  before.selectNodeContents(editor)
  before.setEnd(range.startContainer, range.startOffset)
  const through = document.createRange()
  through.selectNodeContents(editor)
  through.setEnd(range.endContainer, range.endOffset)
  return { start: before.toString().length, end: through.toString().length, range }
}

function setEditorSelection(editor: HTMLElement, start: number, end = start) {
  const selection = window.getSelection()
  if (!selection) return
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    textNodes.push(current as Text)
    current = walker.nextNode()
  }
  const locate = (offset: number): { node: Node; offset: number } => {
    let remaining = Math.max(0, offset)
    for (const textNode of textNodes) {
      if (remaining <= textNode.data.length) return { node: textNode, offset: remaining }
      remaining -= textNode.data.length
    }
    return { node: editor, offset: editor.childNodes.length }
  }
  const from = locate(start)
  const to = locate(end)
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

function fragmentHtml(fragment: DocumentFragment): string {
  const container = document.createElement('div')
  container.append(fragment)
  return sanitizeRichText(container.innerHTML)
}

function splitEditorAtSelection(editor: HTMLElement, range: Range) {
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(editor)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const afterRange = document.createRange()
  afterRange.selectNodeContents(editor)
  afterRange.setStart(range.endContainer, range.endOffset)
  const beforeHtml = fragmentHtml(beforeRange.cloneContents())
  const afterHtml = fragmentHtml(afterRange.cloneContents())
  const before = plainTextFromRichText(beforeHtml)
  const after = plainTextFromRichText(afterHtml)
  return {
    before, after,
    beforeRichText: compactRichText(beforeHtml, before),
    afterRichText: compactRichText(afterHtml, after),
  }
}

function OutlineRow({
  node, depth, number, showNumbering, previousId, nextId, selected, registerInput, focusNode, dragState, setDragState,
  onFormatSelection, onSelect,
  onOpenDetails,
  onOpenWikiLink, readOnly,
}: {
  node: NodeData
  depth: number
  number: string
  showNumbering: boolean
  previousId?: string
  nextId?: string
  selected: boolean
  registerInput: (id: string, element: HTMLElement | null) => void
  focusNode: (id: string, caret?: number | 'end' | 'all') => void
  dragState?: { id: string; position: DropPosition }
  setDragState: (state?: { id: string; position: DropPosition }) => void
  onFormatSelection: (selection?: FormatSelection) => void
  onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void
  onOpenDetails: (id: string) => void
  onOpenWikiLink: (name: string) => void
  readOnly: boolean
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const [descriptionEditing, setDescriptionEditing] = useState(false)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (document.activeElement !== editor) {
      const html = node.richText ? sanitizeRichText(node.richText) : richTextFromPlain(node.title)
      if (sanitizeRichText(editor.innerHTML) !== html) editor.innerHTML = html
    }
    highlightWikiEditor(editor)
  }, [node.richText, node.title])
  useEffect(() => {
    const editor = editorRef.current
    return () => { if (editor) clearWikiEditor(editor) }
  }, [])

  const readEditor = () => {
    const html = sanitizeRichText(editorRef.current?.innerHTML ?? '')
    const title = plainTextFromRichText(html)
    return { title, html, richText: compactRichText(html, title) }
  }

  const commit = () => {
    if (readOnly) return
    const value = readEditor()
    if (value.title !== node.title || value.richText !== node.richText) {
      useDocumentStore.getState().updateNode(node.id, { title: value.title, richText: value.richText })
    }
  }

  const reportSelection = () => {
    const editor = editorRef.current
    if (!editor) return onFormatSelection(undefined)
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return onFormatSelection(undefined)
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return onFormatSelection(undefined)
    const rect = range.getBoundingClientRect()
    onFormatSelection({ nodeId: node.id, range: range.cloneRange(), left: rect.left + rect.width / 2, top: rect.top })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const editor = event.currentTarget
    const { start, end, range } = selectedOffsets(editor)
    const value = readEditor()
    const store = useDocumentStore.getState()
    const mod = event.ctrlKey || event.metaKey

    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault()
      commit()
      setDescriptionEditing(true)
      requestAnimationFrame(() => descriptionRef.current?.focus())
      return
    }
    if (mod && event.key === 'Enter') {
      event.preventDefault()
      document.execCommand('strikeThrough')
      commit()
      return
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'x' && range && start !== end) {
      event.preventDefault()
      const wrapper = document.createElement('span')
      wrapper.dataset.cloze = 'true'
      wrapper.append(range.extractContents())
      range.insertNode(wrapper)
      setEditorSelection(editor, start, end)
      commit()
      return
    }
    if (mod && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      document.execCommand(event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline')
      commit()
      return
    }
    if (mod && event.key.toLowerCase() === 'k' && range && start !== end) {
      event.preventDefault()
      const href = window.prompt('输入链接地址（http://、https:// 或 mailto:）')?.trim()
      if (href) {
        setEditorSelection(editor, start, end)
        document.execCommand('createLink', false, href)
        commit()
      }
      return
    }
    if (event.altKey && !mod) {
      const color = ({ d: '#37413b', r: '#c14f4f', y: '#a67c00', g: '#3f7652', b: '#426fa3', p: '#76558f' } as Record<string, string>)[event.key.toLowerCase()]
      if (color && range && start !== end) {
        event.preventDefault()
        setEditorSelection(editor, start, end)
        document.execCommand('foreColor', false, color)
        commit()
        return
      }
      if (event.key.toLowerCase() === 'l' && range && start !== end) {
        event.preventDefault()
        const wrapper = document.createElement('code')
        wrapper.append(range.extractContents())
        range.insertNode(wrapper)
        setEditorSelection(editor, start, end)
        commit()
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && range) {
      event.preventDefault()
      const split = splitEditorAtSelection(editor, range)
      const newId = store.split(node.id, split.before, split.after, split.beforeRichText, split.afterRichText)
      if (newId) {
        setSelectedNode(newId)
        focusNode(newId, 0)
      }
      onFormatSelection(undefined)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      commit()
      if (event.shiftKey) store.promote(node.id)
      else store.indent(node.id)
      focusNode(node.id, start)
      return
    }
    if (mod && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault()
      store.remove(node.id)
      if (previousId) {
        setSelectedNode(previousId)
        focusNode(previousId, 'end')
      }
      return
    }
    if (event.key === 'Backspace' && start === 0 && end === 0 && previousId) {
      event.preventDefault()
      const previous = store.documents.find((document) => document.id === store.activeDocumentId)
      const previousTitle = previous ? findTitle(previous.root, previousId) : ''
      store.updateNode(node.id, value)
      store.mergeInto(node.id, previousId)
      setSelectedNode(previousId)
      focusNode(previousId, previousTitle.length)
      return
    }
    if (event.key === 'ArrowUp' && start === 0 && end === 0 && previousId) {
      event.preventDefault()
      commit()
      setSelectedNode(previousId)
      focusNode(previousId, 'end')
      return
    }
    if (event.key === 'ArrowDown' && start === value.title.length && end === value.title.length && nextId) {
      event.preventDefault()
      commit()
      setSelectedNode(nextId)
      focusNode(nextId, 0)
      return
    }
    if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      commit()
      const newId = store.duplicate(node.id)
      if (newId) {
        setSelectedNode(newId)
        focusNode(newId, 'all')
      }
      return
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault()
      store.updateNode(node.id, { taskStatus: node.taskStatus === 'none' ? 'todo' : 'none' })
      return
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      store.updateNode(node.id, { taskStatus: node.taskStatus === 'done' ? 'todo' : 'done' })
      return
    }
    if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const currentDocument = store.documents.find((item) => item.id === store.activeDocumentId)
      const match = currentDocument && findParent(currentDocument.root, node.id)
      if (!match) return
      const sibling = event.key === 'ArrowUp'
        ? match.parent.children[match.index - 1]
        : match.parent.children[match.index + 1]
      if (!sibling) return
      event.preventDefault()
      commit()
      store.moveRelative(node.id, sibling.id, event.key === 'ArrowUp' ? 'before' : 'after')
      focusNode(node.id, start)
      return
    }
    if (event.altKey && event.key === '.') {
      event.preventDefault()
      store.toggleCollapsed(node.id)
    }
  }

  const dropPosition = dragState?.id === node.id ? dragState.position : undefined

  return (
    <div
      className={`outline-row ${selected ? 'is-selected' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}
      style={{ '--outline-depth': depth } as React.CSSProperties}
      data-node-id={node.id}
      onContextMenu={() => setSelectedNode(node.id)}
      onDragOver={(event) => {
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const ratio = (event.clientY - bounds.top) / Math.max(bounds.height, 1)
        setDragState({ id: node.id, position: ratio < .27 ? 'before' : ratio > .73 ? 'after' : 'inside' })
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const value = event.dataTransfer.getData('application/x-zhijian-outline-nodes')
        let sourceIds: string[] = []
        try { sourceIds = JSON.parse(value) as string[] } catch { sourceIds = [] }
        if (sourceIds.length && dropPosition) useDocumentStore.getState().moveManyRelative(sourceIds, node.id, dropPosition)
        setDragState(undefined)
      }}
    >
      <button
        className="outline-drag-handle"
        draggable={!readOnly}
        aria-label={`拖动主题 ${node.title}`}
        title="拖动调整顺序或层级"
        onDragStart={(event) => {
          const currentSelection = useSelectionStore.getState().selectedNodeIds
          const sourceIds = selected && currentSelection.length > 1 ? currentSelection : [node.id]
          event.dataTransfer.setData('application/x-zhijian-outline-nodes', JSON.stringify(sourceIds))
          event.dataTransfer.effectAllowed = 'move'
          if (sourceIds.length === 1) setSelectedNode(node.id)
        }}
        onDragEnd={() => setDragState(undefined)}
      ><GripVertical size={15} /></button>
      <button
        className={`outline-bullet ${node.children.length ? 'has-children' : ''}`}
        aria-label={node.children.length ? (node.collapsed ? '展开下级主题' : '折叠下级主题') : '选中主题'}
        onClick={(event) => {
          const mode = event.shiftKey ? 'range' : (event.ctrlKey || event.metaKey) ? 'toggle' : 'single'
          onSelect(node.id, mode)
          if (node.children.length && mode === 'single' && !readOnly) useDocumentStore.getState().toggleCollapsed(node.id)
          else if (mode === 'single') focusNode(node.id)
        }}
      >
        {node.children.length
          ? (node.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)
          : <Circle size={8} fill="currentColor" />}
      </button>
      {showNumbering && <span className="outline-number" aria-hidden="true">{number}</span>}
      {node.taskStatus !== 'none' && <button
        className={`outline-task task-${node.taskStatus}`}
        aria-label={node.taskStatus === 'done' ? '标记为未完成' : '标记为已完成'}
        onClick={() => useDocumentStore.getState().updateNode(node.id, { taskStatus: node.taskStatus === 'done' ? 'todo' : 'done' })}
      >{node.taskStatus === 'done' ? <Check size={13} /> : <span />}</button>}
      <div
        ref={(element) => {
          editorRef.current = element
          registerInput(node.id, element)
        }}
        className="outline-topic-input"
        style={{
          color: node.style.color,
          background: node.style.background,
          fontWeight: node.style.fontWeight,
          fontStyle: node.style.fontStyle,
          textDecoration: node.style.textDecoration,
        }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-label="主题内容"
        aria-multiline="true"
        data-placeholder="输入主题"
        spellCheck={false}
        dangerouslySetInnerHTML={{ __html: node.richText ? sanitizeRichText(node.richText) : richTextFromPlain(node.title) }}
        onFocus={() => setSelectedNode(node.id)}
        onBlur={() => {
          commit()
          window.setTimeout(() => {
            if (!document.activeElement?.closest('.outline-format-toolbar')) onFormatSelection(undefined)
          }, 0)
        }}
        onInput={(event) => {
          if (!(event.nativeEvent as InputEvent).isComposing) highlightWikiEditor(event.currentTarget)
          reportSelection()
        }}
        onCompositionEnd={(event) => highlightWikiEditor(event.currentTarget)}
        onDoubleClickCapture={(event) => {
          const name = wikiLinkAtPoint(event.currentTarget, event.clientX, event.clientY)
          if (!name) return
          event.preventDefault(); event.stopPropagation()
          commit()
          onOpenWikiLink(name)
        }}
        onPointerUp={reportSelection}
        onKeyUp={reportSelection}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
      />
      <div className="outline-topic-tools" aria-label="主题快捷操作">
        <button title="添加下级主题（Tab）" aria-label="添加下级主题" onClick={() => {
          const id = useDocumentStore.getState().insertChild(node.id, '')
          if (id) { setSelectedNode(id); focusNode(id, 0) }
        }}><Plus size={13} /></button>
        <button title="添加或取消待办（Ctrl+Shift+L）" aria-label="切换待办" onClick={() => useDocumentStore.getState().updateNode(node.id, { taskStatus: node.taskStatus === 'none' ? 'todo' : 'none' })}><ListChecks size={13} /></button>
        <button title="编辑描述（Shift+Enter）" aria-label="编辑描述" onClick={() => {
          setSelectedNode(node.id)
          setDescriptionEditing(true)
          requestAnimationFrame(() => descriptionRef.current?.focus())
        }}><StickyNote size={13} /></button>
      </div>
      {(node.note || descriptionEditing) && <div className="outline-description">
        {descriptionEditing ? <textarea
          ref={descriptionRef}
          value={node.note}
          aria-label={`${node.title || '主题'}的描述`}
          placeholder="输入描述；Shift + Enter 返回主题"
          rows={Math.min(8, Math.max(1, node.note.split('\n').length))}
          onChange={(event) => useDocumentStore.getState().updateNode(node.id, { note: event.target.value })}
          onBlur={() => setDescriptionEditing(false)}
          onKeyDown={(event) => {
            if (event.shiftKey && event.key === 'Enter') {
              event.preventDefault()
              setDescriptionEditing(false)
              focusNode(node.id, 'end')
            }
          }}
        /> : <button title="点击编辑描述" onClick={() => {
          setDescriptionEditing(true)
          requestAnimationFrame(() => descriptionRef.current?.focus())
        }}><WikiText text={node.note} onOpen={onOpenWikiLink} /></button>}
      </div>}
      {(node.tags.length > 0 || node.hyperlink || node.code || node.formula || node.table || node.image || node.attachments.length > 0) && <div className="outline-node-meta">
        {node.tags.map((tag) => <span className="outline-meta-tag" key={tag}>#{tag}</span>)}
        {node.hyperlink && <a href={node.hyperlink} target="_blank" rel="noreferrer" title={node.hyperlink}><ExternalLink size={12} />链接</a>}
        {node.code && <button title={node.code} onClick={() => onOpenDetails(node.id)}><FileCode2 size={12} />代码</button>}
        {node.formula && <button title={node.formula} onClick={() => onOpenDetails(node.id)}><Sigma size={12} />公式</button>}
        {node.table && <button title={`${node.table.headers.length} 列 × ${node.table.rows.length} 行`} onClick={() => onOpenDetails(node.id)}><Table2 size={12} />表格 {node.table.rows.length}</button>}
        {node.image && <button title="此主题包含图片" onClick={() => onOpenDetails(node.id)}><span className="outline-meta-image"><img src={node.image.url} alt="" /></span>图片</button>}
        {node.attachments.length > 0 && <button title={node.attachments.map((item) => item.fileName).join('\n')} onClick={() => onOpenDetails(node.id)}><Paperclip size={12} />{node.attachments.length}</button>}
      </div>}
      {node.collapsed && node.children.length > 0 && <span className="outline-child-count">{node.children.length}</span>}
    </div>
  )
}

function findTitle(root: NodeData, id: string): string {
  if (root.id === id) return root.title
  for (const child of root.children) {
    const title = findTitle(child, id)
    if (title || child.id === id) return title
  }
  return ''
}

function FormattingToolbar({ selection, editor, close }: {
  selection: FormatSelection
  editor?: HTMLElement
  close: () => void
}) {
  const restoreSelection = () => {
    if (!editor) return false
    editor.focus({ preventScroll: true })
    const browserSelection = window.getSelection()
    browserSelection?.removeAllRanges()
    browserSelection?.addRange(selection.range)
    return true
  }

  const command = (name: string, value?: string) => {
    if (!restoreSelection()) return
    document.execCommand(name, false, value)
    close()
  }

  const wrap = (tagName: 'code' | 'span', cloze = false) => {
    if (!restoreSelection()) return
    const current = window.getSelection()
    if (!current?.rangeCount || current.isCollapsed) return
    const range = current.getRangeAt(0)
    const wrapper = document.createElement(tagName)
    if (cloze) wrapper.dataset.cloze = 'true'
    wrapper.append(range.extractContents())
    range.insertNode(wrapper)
    current.removeAllRanges()
    const next = document.createRange()
    next.selectNodeContents(wrapper)
    current.addRange(next)
    close()
  }

  const createLink = () => {
    const href = window.prompt('输入链接地址（http://、https:// 或 mailto:）')
    if (href?.trim()) command('createLink', href.trim())
  }

  return (
    <div
      className="outline-format-toolbar"
      style={{ left: selection.left, top: selection.top - 10 }}
      role="toolbar"
      aria-label="文字格式"
      onPointerDown={(event) => event.preventDefault()}
    >
      <button aria-label="加粗" title="加粗（Ctrl+B）" onClick={() => command('bold')}><Bold size={14} /></button>
      <button aria-label="斜体" title="斜体（Ctrl+I）" onClick={() => command('italic')}><Italic size={14} /></button>
      <button aria-label="下划线" title="下划线（Ctrl+U）" onClick={() => command('underline')}><Underline size={14} /></button>
      <button aria-label="删除线" title="删除线" onClick={() => command('strikeThrough')}><Strikethrough size={14} /></button>
      <i />
      <button aria-label="红色文字" className="format-color red" title="红色文字" onClick={() => command('foreColor', '#c14f4f')} />
      <button aria-label="蓝色文字" className="format-color blue" title="蓝色文字" onClick={() => command('foreColor', '#426fa3')} />
      <button aria-label="黄色高亮" title="黄色高亮" onClick={() => command('hiliteColor', '#fff1a8')}><Highlighter size={14} /></button>
      <i />
      <button aria-label="链接" title="添加链接" onClick={createLink}><Link2 size={14} /></button>
      <button aria-label="行内代码" title="行内代码" onClick={() => wrap('code')}><Code size={14} /></button>
      <button aria-label="挖空" title="挖空文字" onClick={() => wrap('span', true)}><EyeOff size={14} /></button>
    </div>
  )
}

export function OutlineEditor({ root, documentTitle, onRenameDocument, onOpenDetails, onDropFiles, onOpenPaperNode, paperNodeIds = [], showNumbering = false, onOpenWikiLink, readOnly = false, backlinks }: {
  root: NodeData
  documentTitle: string
  onRenameDocument: (title: string) => void
  onOpenDetails: (nodeId: string) => void
  showNumbering?: boolean
  onDropFiles?: (files: File[], nodeId: string) => void
  onOpenPaperNode?: (nodeId: string) => void
  paperNodeIds?: string[]
  onOpenWikiLink: (name: string) => void
  readOnly?: boolean
  backlinks?: React.ReactNode
}) {
  const inputsRef = useRef(new Map<string, HTMLElement>())
  const explicitFocusRef = useRef<string | undefined>(undefined)
  const [dragState, setDragState] = useState<{ id: string; position: DropPosition }>()
  const [formatSelection, setFormatSelection] = useState<FormatSelection>()
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId)
  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds)
  const selectionAnchorId = useSelectionStore((state) => state.selectionAnchorId)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const setSelectedNodes = useSelectionStore((state) => state.setSelectedNodes)
  const toggleSelectedNode = useSelectionStore((state) => state.toggleSelectedNode)
  const clearSelection = useSelectionStore((state) => state.clearSelection)
  const visible = useMemo(() => flattenVisible(root.children), [root])
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const hasClipboard = useDocumentStore((state) => Boolean(state.clipboard))

  const registerInput = (id: string, element: HTMLElement | null) => {
    if (element) inputsRef.current.set(id, element)
    else inputsRef.current.delete(id)
  }

  const focusNode = (id: string, caret: number | 'end' | 'all' = 'end') => {
    explicitFocusRef.current = id
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const input = inputsRef.current.get(id)
      if (!input) return
      input.focus({ preventScroll: true })
      const length = input.textContent?.length ?? 0
      if (caret === 'all') setEditorSelection(input, 0, length)
      else setEditorSelection(input, caret === 'end' ? length : Math.min(caret, length))
      input.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }))
  }

  useEffect(() => {
    if (!selectedNodeId || !inputsRef.current.has(selectedNodeId)) return
    if (selectedNodeIds.length > 1) return
    if (explicitFocusRef.current === selectedNodeId) {
      explicitFocusRef.current = undefined
      return
    }
    focusNode(selectedNodeId)
    // Only external selection changes should move focus; typing does not change the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedNodeIds.length])

  const selectNode = (id: string, mode: 'single' | 'toggle' | 'range') => {
    setFormatSelection(undefined)
    if (mode === 'toggle') {
      toggleSelectedNode(id)
      return
    }
    if (mode === 'range' && selectionAnchorId) {
      const anchorIndex = visible.findIndex((item) => item.node.id === selectionAnchorId)
      const currentIndex = visible.findIndex((item) => item.node.id === id)
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const from = Math.min(anchorIndex, currentIndex)
        const to = Math.max(anchorIndex, currentIndex)
        setSelectedNodes(visible.slice(from, to + 1).map((item) => item.node.id), id)
        return
      }
    }
    setSelectedNode(id)
  }

  const bulkDelete = () => {
    if (!selectedNodeIds.length) return
    useDocumentStore.getState().removeMany(selectedNodeIds)
    clearSelection()
  }

  const bulkToggleTasks = () => {
    const nodes = visible.filter((item) => selectedSet.has(item.node.id)).map((item) => item.node)
    const nextStatus = nodes.length > 0 && nodes.every((node) => node.taskStatus === 'done') ? 'todo' : 'done'
    useDocumentStore.getState().updateMany(selectedNodeIds, { taskStatus: nextStatus })
  }

  const bulkToggleCollapsed = () => {
    const branches = visible.filter((item) => selectedSet.has(item.node.id) && item.node.children.length).map((item) => item.node)
    const collapse = branches.some((node) => !node.collapsed)
    useDocumentStore.getState().updateMany(branches.map((node) => node.id), { collapsed: collapse })
  }

  const bulkCopy = (cut = false) => {
    if (cut) useDocumentStore.getState().cutMany(selectedNodeIds)
    else useDocumentStore.getState().copyMany(selectedNodeIds)
  }

  const bulkPaste = () => {
    if (!selectedNodeId) return
    const pastedId = useDocumentStore.getState().paste(selectedNodeId)
    if (pastedId) {
      setSelectedNode(pastedId)
      focusNode(pastedId, 'all')
    }
  }

  const createSummary = () => {
    if (!useDocumentStore.getState().addSummary(selectedNodeIds)) {
      window.alert('概要需要选择两个或更多相邻的同级主题。')
    }
  }

  const createFirst = () => {
    const id = useDocumentStore.getState().insertChild(root.id, '')
    if (!id) return
    setSelectedNode(id)
    focusNode(id, 0)
  }

  return (
    <main className="outline-stage" onDragOverCapture={(event) => {
      if (readOnly) return
      if (onDropFiles && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy' }
    }} onDropCapture={(event) => {
      if (readOnly) { event.preventDefault(); event.stopPropagation(); return }
      if (!onDropFiles || !event.dataTransfer.files.length) return
      event.preventDefault(); event.stopPropagation()
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ?? root.id
      onDropFiles(Array.from(event.dataTransfer.files), target)
    }} onClickCapture={(event) => {
      if ((event.target as HTMLElement).closest('.wiki-link')) return
      if (readOnly && (event.target as HTMLElement).closest('.outline-topic-tools, .outline-task, .outline-drag-handle, .outline-description > button, .outline-empty-topic, .outline-node-meta button')) { event.preventDefault(); event.stopPropagation(); return }
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId
      if (target && paperNodeIds.includes(target) && !(event.target as HTMLElement).closest('[contenteditable], input, textarea, .outline-bullet, .outline-drag-handle') && !event.shiftKey && !event.ctrlKey && !event.metaKey) onOpenPaperNode?.(target)
    }} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragState(undefined)
    }} onPointerDown={(event) => {
      if (!(event.target as HTMLElement).closest('.outline-format-toolbar, .outline-topic-input')) setFormatSelection(undefined)
    }}>
      <section className="outline-document">
        <DocumentTitleInput
          className="outline-document-title"
          value={documentTitle}
          aria-label="文档标题"
          placeholder="未命名文档"
          onCommit={onRenameDocument}
          disabled={readOnly}
        />
        <div className="outline-hint">Enter 新建同级 · Tab 缩进 · Shift + Tab 提升 · Ctrl / Shift 点击圆点多选 · 拖动手柄调整结构</div>
        <div className="outline-list" role="tree" aria-label="文档大纲">
          {visible.map(({ node, depth, number }, index) => <OutlineRow
            key={node.id}
            node={node}
            depth={depth}
            number={number}
            showNumbering={showNumbering}
            onOpenWikiLink={onOpenWikiLink}
            readOnly={readOnly}
            previousId={visible[index - 1]?.node.id}
            nextId={visible[index + 1]?.node.id}
            selected={selectedSet.has(node.id)}
            registerInput={registerInput}
            focusNode={focusNode}
            dragState={dragState}
            setDragState={setDragState}
            onFormatSelection={setFormatSelection}
            onSelect={selectNode}
            onOpenDetails={(id) => {
              setSelectedNode(id)
              onOpenDetails(id)
            }}
          />)}
          {!visible.length && <button className="outline-empty-topic" onClick={createFirst}><Plus size={16} />输入第一个主题</button>}
        </div>
        {backlinks}
      </section>
      {formatSelection && <FormattingToolbar
        selection={formatSelection}
        editor={inputsRef.current.get(formatSelection.nodeId)}
        close={() => setFormatSelection(undefined)}
      />}
      {selectedNodeIds.length > 1 && <div className="outline-bulk-toolbar" role="toolbar" aria-label="批量操作">
        <strong>已选 {selectedNodeIds.length} 项</strong>
        <button onClick={() => bulkCopy()} title="复制选中主题"><Copy size={15} />复制</button>
        <button onClick={() => bulkCopy(true)} title="剪切选中主题"><Scissors size={15} />剪切</button>
        {hasClipboard && <button onClick={bulkPaste} title="粘贴到当前主题下"><ClipboardPaste size={15} />粘贴</button>}
        <button onClick={createSummary} title="为相邻同级主题创建概要"><Braces size={15} />概要</button>
        <button onClick={bulkToggleTasks} title="切换完成状态"><ListChecks size={15} />完成</button>
        <button onClick={bulkToggleCollapsed} title="折叠或展开选中分支"><UnfoldVertical size={15} />折叠</button>
        <button className="danger" onClick={bulkDelete} title="删除选中主题及其下级"><Trash2 size={15} />删除</button>
        <button onClick={clearSelection}>取消</button>
      </div>}
    </main>
  )
}
