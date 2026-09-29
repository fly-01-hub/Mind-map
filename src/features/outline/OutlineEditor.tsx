import { Check, ChevronDown, ChevronRight, Circle, GripVertical, Plus, StickyNote } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { useSelectionStore } from '../../stores/selectionStore'
import type { NodeData } from '../../types/mindmap'

interface VisibleNode {
  node: NodeData
  depth: number
}

type DropPosition = 'before' | 'inside' | 'after'

function flattenVisible(nodes: NodeData[], depth = 0, result: VisibleNode[] = []): VisibleNode[] {
  for (const node of nodes) {
    result.push({ node, depth })
    if (!node.collapsed) flattenVisible(node.children, depth + 1, result)
  }
  return result
}

function OutlineRow({
  node, depth, previousId, nextId, registerInput, focusNode, dragState, setDragState,
}: {
  node: NodeData
  depth: number
  previousId?: string
  nextId?: string
  registerInput: (id: string, element: HTMLTextAreaElement | null) => void
  focusNode: (id: string, caret?: number | 'end' | 'all') => void
  dragState?: { id: string; position: DropPosition }
  setDragState: (state?: { id: string; position: DropPosition }) => void
}) {
  const [draft, setDraft] = useState(node.title)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const selected = useSelectionStore((state) => state.selectedNodeId === node.id)

  useEffect(() => {
    if (globalThis.document.activeElement !== textareaRef.current) setDraft(node.title)
  }, [node.title])

  useLayoutEffect(() => {
    const input = textareaRef.current
    if (!input) return
    input.style.height = '0px'
    input.style.height = `${Math.max(30, input.scrollHeight)}px`
  }, [draft])

  const commit = () => {
    if (draft !== node.title) useDocumentStore.getState().updateNode(node.id, { title: draft })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    const input = event.currentTarget
    const start = input.selectionStart
    const end = input.selectionEnd
    const store = useDocumentStore.getState()
    const mod = event.ctrlKey || event.metaKey

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const newId = store.split(node.id, draft.slice(0, start), draft.slice(end))
      if (newId) {
        setSelectedNode(newId)
        focusNode(newId, 0)
      }
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
      const previous = useDocumentStore.getState().documents
        .find((document) => document.id === useDocumentStore.getState().activeDocumentId)
      const previousTitle = previous ? findTitle(previous.root, previousId) : ''
      store.updateNode(node.id, { title: draft })
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
    if (event.key === 'ArrowDown' && start === draft.length && end === draft.length && nextId) {
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
        const sourceId = event.dataTransfer.getData('application/x-zhijian-outline-node')
        if (sourceId && dropPosition) useDocumentStore.getState().moveRelative(sourceId, node.id, dropPosition)
        setDragState(undefined)
      }}
    >
      <button
        className="outline-drag-handle"
        draggable
        aria-label={`拖动主题 ${node.title}`}
        title="拖动调整顺序或层级"
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-zhijian-outline-node', node.id)
          event.dataTransfer.effectAllowed = 'move'
          setSelectedNode(node.id)
        }}
        onDragEnd={() => setDragState(undefined)}
      ><GripVertical size={15} /></button>
      <button
        className={`outline-bullet ${node.children.length ? 'has-children' : ''}`}
        aria-label={node.children.length ? (node.collapsed ? '展开下级主题' : '折叠下级主题') : '选中主题'}
        onClick={() => {
          setSelectedNode(node.id)
          if (node.children.length) useDocumentStore.getState().toggleCollapsed(node.id)
          else focusNode(node.id)
        }}
      >
        {node.children.length
          ? (node.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)
          : <Circle size={8} fill="currentColor" />}
      </button>
      {node.taskStatus !== 'none' && <button
        className={`outline-task task-${node.taskStatus}`}
        aria-label={node.taskStatus === 'done' ? '标记为未完成' : '标记为已完成'}
        onClick={() => useDocumentStore.getState().updateNode(node.id, { taskStatus: node.taskStatus === 'done' ? 'todo' : 'done' })}
      >{node.taskStatus === 'done' ? <Check size={13} /> : <span />}</button>}
      <textarea
        ref={(element) => {
          textareaRef.current = element
          registerInput(node.id, element)
        }}
        className="outline-topic-input"
        rows={1}
        value={draft}
        aria-label="主题内容"
        spellCheck={false}
        onFocus={() => setSelectedNode(node.id)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
      {node.note && <button className="outline-note-indicator" title={node.note} aria-label="此主题有描述"><StickyNote size={13} /></button>}
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

export function OutlineEditor({ root, documentTitle, onRenameDocument }: {
  root: NodeData
  documentTitle: string
  onRenameDocument: (title: string) => void
}) {
  const inputsRef = useRef(new Map<string, HTMLTextAreaElement>())
  const explicitFocusRef = useRef<string | undefined>(undefined)
  const [dragState, setDragState] = useState<{ id: string; position: DropPosition }>()
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const visible = useMemo(() => flattenVisible(root.children), [root])

  const registerInput = (id: string, element: HTMLTextAreaElement | null) => {
    if (element) inputsRef.current.set(id, element)
    else inputsRef.current.delete(id)
  }

  const focusNode = (id: string, caret: number | 'end' | 'all' = 'end') => {
    explicitFocusRef.current = id
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const input = inputsRef.current.get(id)
      if (!input) return
      input.focus({ preventScroll: true })
      const end = input.value.length
      if (caret === 'all') input.setSelectionRange(0, end)
      else {
        const offset = caret === 'end' ? end : Math.min(caret, end)
        input.setSelectionRange(offset, offset)
      }
      input.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }))
  }

  useEffect(() => {
    if (!selectedNodeId || !inputsRef.current.has(selectedNodeId)) return
    if (explicitFocusRef.current === selectedNodeId) {
      explicitFocusRef.current = undefined
      return
    }
    focusNode(selectedNodeId)
    // Only external selection changes should move focus; typing does not change the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId])

  const createFirst = () => {
    const id = useDocumentStore.getState().insertChild(root.id, '')
    if (!id) return
    setSelectedNode(id)
    focusNode(id, 0)
  }

  return (
    <main className="outline-stage" onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragState(undefined)
    }}>
      <section className="outline-document">
        <input
          className="outline-document-title"
          value={documentTitle}
          aria-label="文档标题"
          placeholder="未命名文档"
          onChange={(event) => onRenameDocument(event.target.value)}
        />
        <div className="outline-hint">Enter 新建同级 · Tab 缩进 · Shift + Tab 提升 · 拖动圆点调整结构</div>
        <div className="outline-list" role="tree" aria-label="文档大纲">
          {visible.map(({ node, depth }, index) => <OutlineRow
            key={node.id}
            node={node}
            depth={depth}
            previousId={visible[index - 1]?.node.id}
            nextId={visible[index + 1]?.node.id}
            registerInput={registerInput}
            focusNode={focusNode}
            dragState={dragState}
            setDragState={setDragState}
          />)}
          {!visible.length && <button className="outline-empty-topic" onClick={createFirst}><Plus size={16} />输入第一个主题</button>}
        </div>
      </section>
    </main>
  )
}
