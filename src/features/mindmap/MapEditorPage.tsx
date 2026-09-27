import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft, BookOpen, Check, ChevronRight, CircleAlert, CircleHelp, Focus, History,
  FileDown, FileUp, ImageDown, Maximize2, Minus, MoreHorizontal, PanelRight,
  Plus, Redo2, Search, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MindMapEngineAdapter, type NodeAnchor } from '../../adapters/mindmap/MindMapEngineAdapter'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useUiStore } from '../../stores/uiStore'
import { countNodes, findNode, getBreadcrumbs } from '../../utils/tree'
import { NodeContextMenu, type NodeCommand } from './NodeContextMenu'
import { HistoryDialog, ImportMarkdownDialog } from './EditorDialogs'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { isPdfFile, titleFromPdfFileName } from '../../repositories/paperRepository'
import { usePaperStore } from '../../stores/paperStore'
import { useUserStore } from '../../stores/userStore'
import { documentRepository } from '../../repositories/documentRepository'
import { downloadText } from '../../services/export/download'
import { markdownToTree, treeToMarkdown, type MarkdownPaperSources } from '../../services/export/markdown'
import { searchDocuments } from '../../utils/search'
import { ShortcutHelpDialog } from './ShortcutHelpDialog'
import 'mind-elixir/style.css'

const NodeInspector = lazy(() => import('../nodeInspector/NodeInspector').then((module) => ({ default: module.NodeInspector })))

const saveLabels = {
  saving: { label: '正在保存…', icon: <span className="sync-dot" /> },
  local: { label: '已保存到本地', icon: <Check size={14} /> },
  error: { label: '保存失败', icon: <CircleAlert size={14} /> },
}

export function MapEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canvasRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MindMapEngineAdapter | undefined>(undefined)
  const composingRef = useRef(false)
  const pendingEditRef = useRef<string | undefined>(undefined)
  const panPointerRef = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined)
  const selectionDragRef = useRef<{ x: number; y: number; endX: number; endY: number } | undefined>(undefined)
  const handledNavigationRef = useRef('')
  const focusedNavigationRef = useRef('')
  const [engineReady, setEngineReady] = useState(false)
  const [nodeAnchor, setNodeAnchor] = useState<NodeAnchor>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileDropTargetId, setFileDropTargetId] = useState<string>()
  const [canvasScale, setCanvasScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('zhijian-inspector-width'))
    return Number.isFinite(saved) && saved >= 300 && saved <= 520 ? saved : 360
  })
  const userId = useUserStore((state) => state.id) ?? 'local-demo-user'
  const papers = usePaperStore((state) => state.papers)
  const paperAnnotations = usePaperStore((state) => state.annotations)
  const annotationNodeRelations = usePaperStore((state) => state.annotationNodeRelations)

  const documents = useDocumentStore((state) => state.documents)
  const document = documents.find((item) => item.id === id)
  const openDocument = useDocumentStore((state) => state.openDocument)
  const renameDocument = useDocumentStore((state) => state.renameDocument)
  const replaceFocusedTree = useDocumentStore((state) => state.replaceFocusedTree)
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const inspectorOpen = useUiStore((state) => state.inspectorOpen)
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen)
  const focusRootId = useUiStore((state) => state.focusRootId)
  const setFocusRoot = useUiStore((state) => state.setFocusRoot)
  const searchOpen = useUiStore((state) => state.searchOpen)
  const setSearchOpen = useUiStore((state) => state.setSearchOpen)
  const saveStatus = useSaveStore((state) => state.status)
  const targetNodeId = searchParams.get('nodeId') ?? undefined

  const viewRoot = useMemo(() => document && (focusRootId ? findNode(document.root, focusRootId) : document.root), [document, focusRootId])
  const selectedNode = document && selectedNodeId ? findNode(document.root, selectedNodeId) : undefined
  const breadcrumbs = document && focusRootId ? getBreadcrumbs(document.root, focusRootId) : []
  const searchResults = useMemo(() => document ? searchDocuments([document], searchQuery) : [], [document, searchQuery])
  const markdownPaperSources = useMemo(() => {
    if (!document) return {}
    const sources: MarkdownPaperSources = {}
    for (const relation of annotationNodeRelations.filter((item) => item.documentId === document.id)) {
      const annotation = paperAnnotations.find((item) => item.id === relation.annotationId)
      const paper = annotation && papers.find((item) => item.id === annotation.paperId)
      if (!annotation || !paper) continue
      ;(sources[relation.nodeId] ??= []).push({
        paperTitle: paper.title, pageNumber: annotation.pageNumber,
        selectedText: annotation.selectedText, note: annotation.content,
      })
    }
    return sources
  }, [annotationNodeRelations, document, paperAnnotations, papers])

  useEffect(() => {
    if (id) openDocument(id)
    return () => setFocusRoot(undefined)
  }, [id, openDocument, setFocusRoot])

  useEffect(() => {
    const navigationKey = `${id ?? ''}:${targetNodeId ?? ''}`
    if (!document || !targetNodeId || handledNavigationRef.current === navigationKey) return
    if (!findNode(document.root, targetNodeId)) return
    handledNavigationRef.current = navigationKey
    useDocumentStore.getState().revealNode(targetNodeId)
    setFocusRoot(undefined)
    setSelectedNode(targetNodeId)
    setInspectorOpen(true)
  }, [document, id, setFocusRoot, setInspectorOpen, setSelectedNode, targetNodeId])

  useEffect(() => {
    const element = canvasRef.current
    if (!element || !viewRoot) return
    let active = true
    const adapter = new MindMapEngineAdapter(element, {
      onSelectionChange: setSelectedNode,
      onTreeChange: (root) => {
        const currentFocus = useUiStore.getState().focusRootId
        replaceFocusedTree(root, currentFocus)
      },
    })
    adapterRef.current = adapter
    let started = false
    const initTimer = window.setTimeout(() => {
      if (!active) return
      started = true
      void adapter.init(viewRoot).then(() => {
        if (!active) return
        setEngineReady(true)
        setCanvasScale(adapter.getScale())
        const selection = useSelectionStore.getState().selectedNodeId
        if (selection) adapter.select(selection)
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(initTimer)
      setEngineReady(false)
      if (started) adapter.destroy()
      adapterRef.current = undefined
    }
    // The adapter owns one engine instance per document; data refreshes in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, document?.id])

  useEffect(() => {
    if (!engineReady || !viewRoot) return
    adapterRef.current?.render(viewRoot)
    const editId = pendingEditRef.current
    if (editId) {
      pendingEditRef.current = undefined
      requestAnimationFrame(() => {
        adapterRef.current?.select(editId)
        adapterRef.current?.beginEdit(editId)
      })
    }
  }, [engineReady, viewRoot])

  useEffect(() => {
    if (!engineReady) return
    if (selectedNodeId) requestAnimationFrame(() => adapterRef.current?.select(selectedNodeId))
    else adapterRef.current?.clearSelection()
  }, [engineReady, selectedNodeId])

  useEffect(() => {
    if (!engineReady || !viewRoot || !targetNodeId) return
    const navigationKey = `${id ?? ''}:${targetNodeId}`
    if (focusedNavigationRef.current === navigationKey) return
    const path = getBreadcrumbs(viewRoot, targetNodeId)
    if (!path.length || path.slice(0, -1).some((node) => node.collapsed)) return
    focusedNavigationRef.current = navigationKey
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      adapterRef.current?.reveal(targetNodeId)
      setNodeAnchor(adapterRef.current?.anchorFor(targetNodeId))
    }))
    return () => cancelAnimationFrame(frame)
  }, [engineReady, id, targetNodeId, viewRoot])

  useEffect(() => {
    const update = () => selectedNodeId && setNodeAnchor(adapterRef.current?.anchorFor(selectedNodeId))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [selectedNodeId])

  const editNewNode = useCallback((nodeId?: string) => {
    if (!nodeId) return
    pendingEditRef.current = nodeId
    setSelectedNode(nodeId)
  }, [setSelectedNode])

  const command = useCallback((name: NodeCommand) => {
    const store = useDocumentStore.getState()
    const selection = useSelectionStore.getState().selectedNodeId
    const currentDocument = store.documents.find((item) => item.id === store.activeDocumentId)
    if (!selection || !currentDocument) return
    switch (name) {
      case 'child': editNewNode(store.insertChild(selection)); break
      case 'sibling': editNewNode(store.insertSibling(selection)); break
      case 'promote': store.promote(selection); break
      case 'remove': if (selection !== currentDocument.root.id) { store.remove(selection); setSelectedNode(undefined) } break
      case 'removeOnly': if (selection !== currentDocument.root.id) { store.removeOnly(selection); setSelectedNode(undefined) } break
      case 'duplicate': editNewNode(store.duplicate(selection)); break
      case 'copy': store.copy(selection); break
      case 'cut': store.cut(selection); break
      case 'paste': editNewNode(store.paste(selection)); break
      case 'toggle': adapterRef.current?.toggleExpanded(selection); break
      case 'toggleSiblings': store.toggleSiblingChildren(selection); break
      case 'focus': setFocusRoot(selection); break
      default: setInspectorOpen(true)
    }
  }, [editNewNode, setFocusRoot, setInspectorOpen, setSelectedNode])

  const startInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const move = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.min(520, Math.max(300, window.innerWidth - pointerEvent.clientX))
      setInspectorWidth(nextWidth)
      window.localStorage.setItem('zhijian-inspector-width', String(nextWidth))
    }
    const stop = () => {
      globalThis.document.body.classList.remove('is-resizing-inspector')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    globalThis.document.body.classList.add('is-resizing-inspector')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  const finishSelectionDelete = (startX: number, startY: number, endX: number, endY: number) => {
    if (Math.hypot(endX - startX, endY - startY) < 8) return
    const bounds = {
      left: Math.min(startX, endX), right: Math.max(startX, endX),
      top: Math.min(startY, endY), bottom: Math.max(startY, endY),
    }
    const containsAll = endY >= startY
    const nodeIds = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('.me-tpc') ?? [])
      .filter((topic) => !topic.closest('.me-root'))
      .filter((topic) => {
        const rect = topic.getBoundingClientRect()
        if (!rect.width || !rect.height) return false
        return containsAll
          ? rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom
          : rect.left <= bounds.right && rect.right >= bounds.left && rect.top <= bounds.bottom && rect.bottom >= bounds.top
      })
      .map((topic) => (topic as HTMLElement & { nodeObj?: { id?: string } }).nodeObj?.id)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
    if (!nodeIds.length) return
    adapterRef.current?.clearSelection()
    useDocumentStore.getState().removeMany(nodeIds)
    setSelectedNode(undefined)
    setNodeAnchor(undefined)
  }

  useEffect(() => {
    const handleWindowShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || (event.key !== ']' && event.code !== 'BracketRight')) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      command('focus')
    }
    window.addEventListener('keydown', handleWindowShortcut)
    return () => window.removeEventListener('keydown', handleWindowShortcut)
  }, [command])

  const attachFiles = async (files: FileList | File[], nodeId: string) => {
    if (!document) return
    const store = useDocumentStore.getState()
    // A file can be dropped immediately after a direct route opens, before the route effect
    // has marked this document active. Make the command self-contained instead of timing-dependent.
    if (store.activeDocumentId !== document.id) store.openDocument(document.id)
    const target = findNode(store.documents.find((item) => item.id === document.id)?.root ?? document.root, nodeId)
    if (!target) return
    const attachments = []
    let openedNodeId = nodeId
    for (const file of Array.from(files)) {
      if (isPdfFile(file)) {
        const paperNodeId = useDocumentStore.getState().insertChild(nodeId)
        if (!paperNodeId) continue
        useDocumentStore.getState().updateNode(paperNodeId, { title: titleFromPdfFileName(file.name) })
        try {
          await usePaperStore.getState().uploadAndLink(file, document.id, paperNodeId, userId)
          openedNodeId = paperNodeId
        } catch {
          useDocumentStore.getState().remove(paperNodeId)
          window.alert(`“${file.name}”导入失败，请确认它是有效的 PDF 文件。`)
        }
      }
      else attachments.push(await attachmentRepository.save(document.id, nodeId, file))
    }
    if (attachments.length) useDocumentStore.getState().updateNode(nodeId, { attachments: [...target.attachments, ...attachments] })
    setSelectedNode(openedNodeId)
    setInspectorOpen(true)
  }

  const importMarkdown = async (markdown: string) => {
    if (!document) return
    await documentRepository.createVersion(document, 'important')
    const root = markdownToTree(markdown)
    useDocumentStore.getState().commitTree(root)
    setSelectedNode(root.id)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const editing = target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))
    if (editing) {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composingRef.current) {
        event.preventDefault()
        const editingNodeId = useSelectionStore.getState().selectedNodeId
        target.blur()
        window.setTimeout(() => {
          if (editingNodeId) editNewNode(useDocumentStore.getState().insertSibling(editingNodeId))
        }, 0)
      } else if (event.key === 'Escape') {
        event.preventDefault(); target.blur()
      }
      return
    }

    const mod = event.ctrlKey || event.metaKey
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) useDocumentStore.getState().redo(); else useDocumentStore.getState().undo(); return }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); useDocumentStore.getState().redo(); return }
    if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); return }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); command('copy'); return }
    if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); command('cut'); return }
    if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); command('paste'); return }
    if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); command('duplicate'); return }
    if (mod && (event.key === ']' || event.code === 'BracketRight')) { event.preventDefault(); command('focus'); return }
    if (mod && event.shiftKey && event.key === '.') { event.preventDefault(); command('toggleSiblings'); return }
    if (event.altKey && event.key === '.') { event.preventDefault(); command('toggle'); return }
    if (event.key === '?') { event.preventDefault(); setHelpOpen(true); return }
    if (event.key === 'Enter') { event.preventDefault(); command('sibling'); return }
    if (event.key === 'Tab') { event.preventDefault(); if (event.shiftKey) command('promote'); else command('child'); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); command('remove'); return }
    if (event.key === 'Escape') { adapterRef.current?.clearSelection(); setSelectedNode(undefined); setSearchOpen(false) }
  }

  if (!document || !viewRoot) return <main className="not-found"><strong>没有找到这份文档</strong><Link to="/library">返回知识库</Link></main>

  const activeSave = saveLabels[saveStatus]
  const isRoot = selectedNodeId === document.root.id

  return (
    <div className={`editor-shell ${inspectorOpen ? 'with-inspector' : ''}`} style={inspectorOpen ? { gridTemplateColumns: `minmax(480px, 1fr) ${inspectorWidth}px` } : undefined}>
      <header className="editor-toolbar">
        <button className="icon-button" onClick={() => navigate('/library')} aria-label="返回知识库" title="返回知识库"><ArrowLeft size={19} /></button>
        <div className="toolbar-divider" />
        <input className="document-title-input" value={document.title} aria-label="文档名称" onChange={(event) => renameDocument(document.id, event.target.value)} />
        <div className={`save-status status-${saveStatus}`}>{activeSave.icon}<span>{activeSave.label}</span></div>
        <span className="document-node-count">{countNodes(document.root)} 个节点</span>
        <div className="toolbar-spacer" />
        <button className="toolbar-action-button add-topic-button" onClick={() => {
          if (!selectedNodeId) setSelectedNode(document.root.id)
          window.setTimeout(() => command('child'), 0)
        }} aria-label="新增子主题" title="在选中主题下添加子主题（Tab）"><Plus size={16} /><span>子主题</span></button>
        <button className={`toolbar-action-button ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="搜索" title="搜索节点（Ctrl + F）"><Search size={16} /><span>搜索</span></button>
        <button className={`toolbar-action-button ${inspectorOpen ? 'active' : ''}`} onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="节点详情" title="打开节点详情"><PanelRight size={16} /><span>详情</span></button>
        <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="操作指南" title="操作指南（?）"><CircleHelp size={18} /></button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button className="icon-button" aria-label="更多" title="导入、导出与历史"><MoreHorizontal size={19} /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end">
            <DropdownMenu.Label className="dropdown-label">导入与导出</DropdownMenu.Label>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => setImportOpen(true)}><FileUp size={16} />导入 Markdown</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToMarkdown(document.root, markdownPaperSources), `${document.title}.md`, 'text/markdown;charset=utf-8')}><FileDown size={16} />导出 Markdown</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => void adapterRef.current?.exportPng(document.title).catch(() => window.alert('PNG 导出失败，请收起部分超大内容后重试。'))}><ImageDown size={16} />导出 2× PNG</DropdownMenu.Item>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Item className="dropdown-item" onSelect={() => setHistoryOpen(true)}><History size={16} />历史版本</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      {breadcrumbs.length > 0 && <div className="focus-breadcrumb"><Focus size={14} />{breadcrumbs.map((node, index) => <span key={node.id}><button onClick={() => index === 0 ? setFocusRoot(undefined) : setFocusRoot(node.id)}>{node.title}</button>{index < breadcrumbs.length - 1 && <ChevronRight size={13} />}</span>)}</div>}
      {searchOpen && <div className="editor-search-panel"><div className="editor-search"><Search size={16} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索节点、标签或笔记…" /><button className="icon-button" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={16} /></button></div>{searchQuery && <div className="editor-search-results">{searchResults.map((result) => <button key={result.nodeId} onClick={() => { setSelectedNode(result.nodeId); setFocusRoot(result.nodeId); setSearchOpen(false); setSearchQuery('') }}><strong>{result.nodeTitle}</strong><span>{result.field === 'note' ? '笔记' : result.field === 'tag' ? '标签' : '标题'} · {result.excerpt}</span></button>)}{!searchResults.length && <p>没有找到相关节点</p>}</div>}</div>}
      <NodeContextMenu onCommand={command} isRoot={isRoot} hasClipboard={Boolean(useDocumentStore.getState().clipboard)}>
        <main
          className={`mindmap-stage ${fileDropTargetId ? 'is-file-dragging' : ''} ${isPanning ? 'is-panning' : ''}`}
          tabIndex={0}
          onPointerDownCapture={(event) => {
            if (!(event.target as HTMLElement).isContentEditable) event.currentTarget.focus({ preventScroll: true })
            const target = event.target as HTMLElement
            if (event.button === 1) {
              event.preventDefault()
              event.nativeEvent.stopImmediatePropagation()
              panPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture(event.pointerId)
              setIsPanning(true)
              return
            }
            if (event.button === 0 && target.classList.contains('map-container')) {
              selectionDragRef.current = { x: event.clientX, y: event.clientY, endX: event.clientX, endY: event.clientY }
            }
          }}
          onPointerMoveCapture={(event) => {
            const pan = panPointerRef.current
            if (pan?.pointerId === event.pointerId) {
              event.preventDefault()
              event.nativeEvent.stopImmediatePropagation()
              adapterRef.current?.panBy(event.clientX - pan.x, event.clientY - pan.y)
              panPointerRef.current = { ...pan, x: event.clientX, y: event.clientY }
              return
            }
            const selection = selectionDragRef.current
            if (selection) selectionDragRef.current = { ...selection, endX: event.clientX, endY: event.clientY }
          }}
          onPointerUpCapture={(event) => {
            const pan = panPointerRef.current
            if (pan?.pointerId === event.pointerId) {
              event.preventDefault()
              event.nativeEvent.stopImmediatePropagation()
              panPointerRef.current = undefined
              setIsPanning(false)
              return
            }
            const selection = selectionDragRef.current
            selectionDragRef.current = undefined
            if (selection) {
              const endX = event.clientX
              const endY = event.clientY
              window.setTimeout(() => finishSelectionDelete(selection.x, selection.y, endX, endY), 0)
            }
          }}
          onLostPointerCapture={() => {
            if (panPointerRef.current) {
              panPointerRef.current = undefined
              setIsPanning(false)
            }
          }}
          onKeyDownCapture={handleKeyDown}
          onCompositionStartCapture={() => { composingRef.current = true }}
          onCompositionEndCapture={() => { composingRef.current = false }}
          onDragEnterCapture={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            const anchor = adapterRef.current?.resolveNode(event.target)
            setFileDropTargetId(anchor?.id ?? selectedNodeId ?? document.root.id)
          }}
          onDragOverCapture={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            const anchor = adapterRef.current?.resolveNode(event.target)
            setFileDropTargetId(anchor?.id ?? selectedNodeId ?? document.root.id)
          }}
          onDragLeaveCapture={(event) => {
            const nextTarget = event.relatedTarget
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setFileDropTargetId(undefined)
          }}
          onDropCapture={(event) => {
            if (!event.dataTransfer.files.length) return
            event.preventDefault()
            event.stopPropagation()
            const anchor = adapterRef.current?.resolveNode(event.target)
            const targetId = anchor?.id ?? fileDropTargetId ?? selectedNodeId ?? document.root.id
            setFileDropTargetId(undefined)
            void attachFiles(event.dataTransfer.files, targetId)
          }}
          onDoubleClickCapture={(event) => {
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (!anchor) return
            event.preventDefault()
            event.stopPropagation()
            setSelectedNode(anchor.id)
            adapterRef.current?.beginEdit(anchor.id)
          }}
          onContextMenuCapture={(event) => {
            if (event.detail === 731) return
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (anchor) {
              event.preventDefault()
              event.stopPropagation()
              setSelectedNode(anchor.id)
              adapterRef.current?.select(anchor.id)
              setNodeAnchor(anchor)
              const stage = event.currentTarget
              const { clientX, clientY } = event.nativeEvent
              requestAnimationFrame(() => stage.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, button: 2, clientX, clientY, detail: 731,
              })))
            }
          }}
          onPointerMove={(event) => {
            const anchor = adapterRef.current?.resolveNode(event.target)
            setNodeAnchor(anchor ?? (selectedNodeId ? adapterRef.current?.anchorFor(selectedNodeId) : undefined))
          }}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true })
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (anchor) {
              setSelectedNode(anchor.id)
              adapterRef.current?.select(anchor.id)
              setNodeAnchor(anchor)
              return
            }
            setSelectedNode(undefined)
            adapterRef.current?.clearSelection()
          }}
        >
          <div ref={canvasRef} className="mindmap-canvas" data-testid="mindmap-canvas" />
          {fileDropTargetId && <div className="file-drop-hint">
            <FileUp size={18} />
            <span>松开以导入；PDF 将成为“{findNode(document.root, fileDropTargetId)?.title ?? document.root.title}”的子节点</span>
          </div>}
          {nodeAnchor && <div className="node-quick-actions" style={{ left: nodeAnchor.left + nodeAnchor.width + 7, top: nodeAnchor.top + nodeAnchor.height / 2 }}>
            {nodeAnchor.hasChildren && <button className="node-mini-button collapse-button" aria-label={nodeAnchor.collapsed ? '展开下级' : '折叠下级'} onClick={() => {
              adapterRef.current?.toggleExpanded(nodeAnchor.id)
              setNodeAnchor({ ...nodeAnchor, collapsed: !nodeAnchor.collapsed })
            }}>{nodeAnchor.collapsed ? <Plus size={12} /> : <Minus size={12} />}</button>}
            {nodeAnchor.id === selectedNodeId && <button className="node-mini-button add-button" aria-label="添加子主题" onClick={() => command('child')}><Plus size={14} /></button>}
          </div>}
          {!fileDropTargetId && <button className="canvas-onboarding-tip" onClick={() => setHelpOpen(true)}><BookOpen size={15} /><span>{countNodes(document.root) === 1 ? '选中中心主题，按 Tab 添加第一个分支' : '双击编辑 · 中键平移 · 左键拖框删除 · 拖入 PDF'}</span><kbd>?</kbd></button>}
          <div className="canvas-controls">
            <button onClick={() => adapterRef.current?.center()} title="居中" aria-label="居中"><Focus size={16} /></button>
            <button onClick={() => setCanvasScale(adapterRef.current?.fit() ?? 1)} title="适应画布" aria-label="适应画布"><Maximize2 size={16} /></button>
            <i />
            <button onClick={() => setCanvasScale(adapterRef.current?.zoomBy(-.1) ?? canvasScale)} disabled={canvasScale <= .4} title="缩小" aria-label="缩小"><ZoomOut size={16} /></button>
            <button className="canvas-scale" onClick={() => setCanvasScale(adapterRef.current?.fit() ?? 1)} title="适应画布">{Math.round(canvasScale * 100)}%</button>
            <button onClick={() => setCanvasScale(adapterRef.current?.zoomBy(.1) ?? canvasScale)} disabled={canvasScale >= 2} title="放大" aria-label="放大"><ZoomIn size={16} /></button>
            <i />
            <button onClick={() => useDocumentStore.getState().undo()} title="撤销（Ctrl + Z）" aria-label="撤销"><Undo2 size={16} /></button>
            <button onClick={() => useDocumentStore.getState().redo()} title="重做（Ctrl + Y）" aria-label="重做"><Redo2 size={16} /></button>
          </div>
        </main>
      </NodeContextMenu>
      {inspectorOpen && <><div className="inspector-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" onPointerDown={startInspectorResize} /><Suspense fallback={<aside className="node-inspector"><div className="inspector-empty">正在打开节点详情…</div></aside>}><NodeInspector key={selectedNode?.id ?? 'empty'} node={selectedNode} documentId={document.id} close={() => setInspectorOpen(false)} /></Suspense></>}
      <HistoryDialog document={document} open={historyOpen} onOpenChange={setHistoryOpen} />
      <ImportMarkdownDialog open={importOpen} onOpenChange={setImportOpen} onImport={importMarkdown} />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
