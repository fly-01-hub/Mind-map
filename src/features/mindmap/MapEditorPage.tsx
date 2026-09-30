import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft, Bold, BookOpen, Check, ChevronRight, CircleAlert, CircleHelp, Focus, Hash, History, Italic, ListTree,
  Eye, FileDown, FileUp, ImageDown, Link2, Maximize2, Minus, MoreHorizontal, Palette, PanelRight,
  Presentation, Network, Plus, Redo2, Search, Trash2, Underline, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MindMapEngineAdapter, type NodeAnchor } from '../../adapters/mindmap/MindMapEngineAdapter'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useUiStore } from '../../stores/uiStore'
import { countNodes, findNode, findParent, getBreadcrumbs } from '../../utils/tree'
import { NodeContextMenu, type NodeCommand } from './NodeContextMenu'
import { HistoryDialog, ImportMarkdownDialog } from './EditorDialogs'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { isPdfFile, titleFromPdfFileName } from '../../repositories/paperRepository'
import { usePaperStore } from '../../stores/paperStore'
import { useUserStore } from '../../stores/userStore'
import { documentRepository } from '../../repositories/documentRepository'
import { downloadBlob, downloadText } from '../../services/export/download'
import { markdownToTree, treeToMarkdown, type MarkdownPaperSources } from '../../services/export/markdown'
import {
  freeMindToTree, opmlToTree, treeToFreeMind, treeToHtml, treeToOpml, treeToXMind, xmindToTree,
} from '../../services/export/interchange'
import { searchDocuments } from '../../utils/search'
import { ShortcutHelpDialog } from './ShortcutHelpDialog'
import { OutlineEditor } from '../outline/OutlineEditor'
import type { NodeData } from '../../types/mindmap'
import 'mind-elixir/style.css'

const NodeInspector = lazy(() => import('../nodeInspector/NodeInspector').then((module) => ({ default: module.NodeInspector })))

const saveLabels = {
  saving: { label: '正在保存…', icon: <span className="sync-dot" /> },
  local: { label: '已保存到本地', icon: <Check size={14} /> },
  error: { label: '保存失败', icon: <CircleAlert size={14} /> },
}

function flattenNodes(root: NodeData): NodeData[] {
  return [root, ...root.children.flatMap(flattenNodes)]
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
  const handledNavigationRef = useRef('')
  const focusedNavigationRef = useRef('')
  const [engineReady, setEngineReady] = useState(false)
  const [nodeAnchor, setNodeAnchor] = useState<NodeAnchor>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileDropTargetId, setFileDropTargetId] = useState<string>()
  const [relationPickerOpen, setRelationPickerOpen] = useState(false)
  const [relationQuery, setRelationQuery] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [canvasScale, setCanvasScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [descriptionFocusRequest, setDescriptionFocusRequest] = useState<{ nodeId: string; nonce: number }>()
  const [editorView, setEditorView] = useState<'outline' | 'mindmap'>(() =>
    window.localStorage.getItem('zhijian-editor-view') === 'mindmap' ? 'mindmap' : 'outline')
  const [outlineNumbering, setOutlineNumbering] = useState(() => window.localStorage.getItem('zhijian-outline-numbering') === 'true')
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
  const updateMapAppearance = useDocumentStore((state) => state.updateMapAppearance)
  const replaceFocusedTree = useDocumentStore((state) => state.replaceFocusedTree)
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId)
  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const setSelectedNodes = useSelectionStore((state) => state.setSelectedNodes)
  const inspectorOpen = useUiStore((state) => state.inspectorOpen)
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen)
  const focusRootId = useUiStore((state) => state.focusRootId)
  const setFocusRoot = useUiStore((state) => state.setFocusRoot)
  const searchOpen = useUiStore((state) => state.searchOpen)
  const setSearchOpen = useUiStore((state) => state.setSearchOpen)
  const saveStatus = useSaveStore((state) => state.status)
  const targetNodeId = searchParams.get('nodeId') ?? undefined
  const activeMapTheme = document?.mapTheme ?? 'paper'
  const compactMap = document?.compactMap ?? false

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
    if (editorView !== 'mindmap' || !element || !viewRoot) return
    let active = true
    const adapter = new MindMapEngineAdapter(element, {
      onSelectionChange: (ids) => {
        if (ids.length) setSelectedNodes(ids, ids.at(-1))
        else setSelectedNode(undefined)
      },
      onMapChange: (root, arrows, summaries) => {
        const currentFocus = useUiStore.getState().focusRootId
        if (currentFocus) replaceFocusedTree(root, currentFocus)
        else useDocumentStore.getState().commitMap(root, arrows, summaries)
      },
    })
    adapterRef.current = adapter
    let started = false
    const initTimer = window.setTimeout(() => {
      if (!active) return
      started = true
      void adapter.init(viewRoot, focusRootId ? [] : document?.arrows, focusRootId ? [] : document?.summaries).then(() => {
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
  }, [id, document?.id, editorView])

  useEffect(() => {
    if (!engineReady || !viewRoot) return
    adapterRef.current?.render(viewRoot, focusRootId ? [] : document?.arrows, focusRootId ? [] : document?.summaries)
    const editId = pendingEditRef.current
    if (editId) {
      pendingEditRef.current = undefined
      requestAnimationFrame(() => {
        adapterRef.current?.select(editId)
        adapterRef.current?.beginEdit(editId)
      })
    }
  }, [document?.arrows, document?.summaries, engineReady, focusRootId, viewRoot])

  useEffect(() => {
    if (!engineReady) return
    adapterRef.current?.setAppearance(activeMapTheme, compactMap)
  }, [activeMapTheme, compactMap, engineReady])

  useEffect(() => {
    if (engineReady) adapterRef.current?.setReadOnly(readOnly || presentationMode)
  }, [engineReady, presentationMode, readOnly])

  useEffect(() => {
    if (!engineReady) return
    if (selectedNodeIds.length > 1) {
      adapterRef.current?.setSelections(selectedNodeIds)
      return
    }
    if (selectedNodeId) requestAnimationFrame(() => adapterRef.current?.select(selectedNodeId))
    else adapterRef.current?.clearSelection()
  }, [engineReady, selectedNodeId, selectedNodeIds])

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
    if (editorView === 'mindmap') pendingEditRef.current = nodeId
    setSelectedNode(nodeId)
  }, [editorView, setSelectedNode])

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
      case 'toggle': if (editorView === 'outline') store.toggleCollapsed(selection); else adapterRef.current?.toggleExpanded(selection); break
      case 'toggleSiblings': store.toggleSiblingChildren(selection); break
      case 'focus': setFocusRoot(selection); break
      default: setInspectorOpen(true)
    }
  }, [editNewNode, editorView, setFocusRoot, setInspectorOpen, setSelectedNode])

  const changeEditorView = (view: 'outline' | 'mindmap') => {
    setEditorView(view)
    setRelationPickerOpen(false)
    window.localStorage.setItem('zhijian-editor-view', view)
    setNodeAnchor(undefined)
  }

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

  useEffect(() => {
    const handleWindowShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.matches('input, textarea, select, [contenteditable]'))
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.altKey && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        changeEditorView(editorView === 'outline' ? 'mindmap' : 'outline')
        return
      }
      if (mod && event.altKey && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        changeEditorView('mindmap')
        setPresentationMode((value) => !value)
        setInspectorOpen(false)
        return
      }
      if (mod && event.key === '/') {
        event.preventDefault()
        setHelpOpen((value) => !value)
        return
      }
      if (editing || !mod) return
      if (event.key === ']' || event.code === 'BracketRight') {
        event.preventDefault()
        command('focus')
        return
      }
      if ((event.key === '[' || event.code === 'BracketLeft') && selectedNodeId && document) {
        const parent = findParent(document.root, selectedNodeId)?.parent
        if (!parent) return
        event.preventDefault()
        setFocusRoot(parent.id === document.root.id ? undefined : parent.id)
        setSelectedNode(parent.id)
      }
    }
    window.addEventListener('keydown', handleWindowShortcut)
    return () => window.removeEventListener('keydown', handleWindowShortcut)
  }, [command, document, editorView, selectedNodeId, setFocusRoot, setInspectorOpen, setSelectedNode])

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

  const importStructuredFile = async (file: File) => {
    if (!document) return
    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    try {
      const root = extension === 'xmind'
        ? await xmindToTree(file)
        : extension === 'opml'
          ? opmlToTree(await file.text())
          : extension === 'mm'
            ? freeMindToTree(await file.text())
            : markdownToTree(await file.text())
      await documentRepository.createVersion(document, 'important')
      useDocumentStore.getState().commitTree(root)
      setSelectedNode(root.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '文件导入失败。')
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const editing = target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))
    if (editing) {
      if (event.key === 'Enter' && event.shiftKey && !event.nativeEvent.isComposing && !composingRef.current) {
        event.preventDefault()
        const editingNodeId = useSelectionStore.getState().selectedNodeId
        target.blur()
        if (editingNodeId) setSelectedNode(editingNodeId)
        setInspectorOpen(true)
        if (editingNodeId) setDescriptionFocusRequest({ nodeId: editingNodeId, nonce: Date.now() })
      } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composingRef.current) {
        event.preventDefault()
        const editingNodeId = useSelectionStore.getState().selectedNodeId
        target.blur()
        window.setTimeout(() => {
          if (editingNodeId) editNewNode(useDocumentStore.getState().insertSibling(editingNodeId))
        }, 0)
      } else if (event.key === 'Tab' && !event.nativeEvent.isComposing && !composingRef.current) {
        event.preventDefault()
        const editingNodeId = useSelectionStore.getState().selectedNodeId
        target.blur()
        window.setTimeout(() => {
          if (!editingNodeId) return
          if (event.shiftKey) {
            useDocumentStore.getState().promote(editingNodeId)
            setSelectedNode(editingNodeId)
          } else editNewNode(useDocumentStore.getState().insertChild(editingNodeId))
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
    <div className={`editor-shell ${inspectorOpen ? 'with-inspector' : ''} ${presentationMode ? 'presentation-mode' : ''}`} style={inspectorOpen && !presentationMode ? { gridTemplateColumns: `minmax(480px, 1fr) ${inspectorWidth}px` } : undefined}>
      <header className="editor-toolbar">
        <button className="icon-button" onClick={() => navigate('/library')} aria-label="返回知识库" title="返回知识库"><ArrowLeft size={19} /></button>
        <div className="toolbar-divider" />
        <input className="document-title-input" value={document.title} aria-label="文档名称" onChange={(event) => renameDocument(document.id, event.target.value)} />
        <div className={`save-status status-${saveStatus}`}>{activeSave.icon}<span>{activeSave.label}</span></div>
        <span className="document-node-count">{countNodes(document.root)} 个节点</span>
        <div className="editor-view-switch" aria-label="切换编辑视图">
          <button className={editorView === 'outline' ? 'active' : ''} onClick={() => changeEditorView('outline')} title="大纲笔记"><ListTree size={15} /><span>大纲</span></button>
          <button className={editorView === 'mindmap' ? 'active' : ''} onClick={() => changeEditorView('mindmap')} title="思维导图"><Network size={15} /><span>导图</span></button>
        </div>
        <div className="toolbar-spacer" />
        <button className="toolbar-action-button add-topic-button" onClick={() => {
          if (!selectedNodeId) setSelectedNode(document.root.id)
          window.setTimeout(() => command('child'), 0)
        }} aria-label="新增子主题" title="在选中主题下添加子主题（Tab）"><Plus size={16} /><span>子主题</span></button>
        {editorView === 'mindmap' && !focusRootId && selectedNodeId && selectedNodeId !== document.root.id && <button className={`toolbar-action-button ${relationPickerOpen ? 'active' : ''}`} onClick={() => setRelationPickerOpen((open) => !open)} aria-label="创建关联线" title="把当前主题关联到另一个主题"><Link2 size={16} /><span>关联</span></button>}
        <button className={`toolbar-action-button ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="搜索" title="搜索节点（Ctrl + F）"><Search size={16} /><span>搜索</span></button>
        <button className={`toolbar-action-button ${inspectorOpen ? 'active' : ''}`} onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="节点详情" title="打开节点详情"><PanelRight size={16} /><span>详情</span></button>
        <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="操作指南" title="操作指南（?）"><CircleHelp size={18} /></button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button className="icon-button" aria-label="更多" title="导入、导出与历史"><MoreHorizontal size={19} /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end">
            <DropdownMenu.Label className="dropdown-label">导入与导出</DropdownMenu.Label>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => window.setTimeout(() => setImportOpen(true), 0)}><FileUp size={16} />导入文件</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToMarkdown(document.root, markdownPaperSources), `${document.title}.md`, 'text/markdown;charset=utf-8')}><FileDown size={16} />导出 Markdown</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToOpml(document.root), `${document.title}.opml`, 'text/x-opml;charset=utf-8')}><FileDown size={16} />导出 OPML</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToFreeMind(document.root), `${document.title}.mm`, 'application/x-freemind;charset=utf-8')}><FileDown size={16} />导出 FreeMind</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => void treeToXMind(document.root).then((blob) => downloadBlob(blob, `${document.title}.xmind`))}><FileDown size={16} />导出 XMind</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToHtml(document.root), `${document.title}.html`, 'text/html;charset=utf-8')}><FileDown size={16} />导出 HTML</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" disabled={editorView !== 'mindmap'} onSelect={() => void adapterRef.current?.exportPng(document.title).catch(() => window.alert('PNG 导出失败，请收起部分超大内容后重试。'))}><ImageDown size={16} />导出 2× PNG</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => window.print()}><FileDown size={16} />打印 / 另存 PDF</DropdownMenu.Item>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Label className="dropdown-label">导图外观</DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={document.mapTheme ?? 'paper'} onValueChange={(mapTheme) => updateMapAppearance(document.id, { mapTheme: mapTheme as 'paper' | 'ocean' | 'warm' | 'mono', compactMap: document.compactMap })}>
              <DropdownMenu.RadioItem className="dropdown-item" value="paper"><Palette size={16} />纸张绿</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="ocean"><Palette size={16} />海洋蓝</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="warm"><Palette size={16} />暖棕色</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="mono"><Palette size={16} />黑白灰</DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={document.compactMap ?? false} onCheckedChange={(compactMap) => updateMapAppearance(document.id, { mapTheme: document.mapTheme, compactMap })}><Maximize2 size={16} />紧凑布局</DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={readOnly} onCheckedChange={setReadOnly}><Eye size={16} />只读浏览</DropdownMenu.CheckboxItem>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => { changeEditorView('mindmap'); setPresentationMode(true); setInspectorOpen(false) }}><Presentation size={16} />演示模式</DropdownMenu.Item>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Label className="dropdown-label">大纲显示</DropdownMenu.Label>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={outlineNumbering} onCheckedChange={(checked) => {
              setOutlineNumbering(checked)
              window.localStorage.setItem('zhijian-outline-numbering', String(checked))
            }}><Hash size={16} />主题编号</DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Item className="dropdown-item" onSelect={() => setHistoryOpen(true)}><History size={16} />历史版本</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      {breadcrumbs.length > 0 && <div className="focus-breadcrumb"><Focus size={14} />{breadcrumbs.map((node, index) => <span key={node.id}><button onClick={() => index === 0 ? setFocusRoot(undefined) : setFocusRoot(node.id)}>{node.title}</button>{index < breadcrumbs.length - 1 && <ChevronRight size={13} />}</span>)}</div>}
      {searchOpen && <div className="editor-search-panel"><div className="editor-search"><Search size={16} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索节点、标签或笔记…" /><button className="icon-button" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={16} /></button></div>{searchQuery && <div className="editor-search-results">{searchResults.map((result) => <button key={result.nodeId} onClick={() => {
        useDocumentStore.getState().revealNode(result.nodeId)
        setSelectedNode(result.nodeId)
        if (editorView === 'mindmap') setFocusRoot(result.nodeId)
        else setFocusRoot(undefined)
        setSearchOpen(false)
        setSearchQuery('')
      }}><strong>{result.nodeTitle}</strong><span>{result.field === 'note' ? '笔记' : result.field === 'tag' ? '标签' : '标题'} · {result.excerpt}</span></button>)}{!searchResults.length && <p>没有找到相关节点</p>}</div>}</div>}
      {relationPickerOpen && selectedNodeId && <div className="editor-search-panel relation-picker"><div className="editor-search"><Link2 size={16} /><input autoFocus value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="搜索要关联的主题…" /><button className="icon-button" onClick={() => { setRelationPickerOpen(false); setRelationQuery('') }}><X size={16} /></button></div><div className="editor-search-results">{flattenNodes(document.root).filter((node) => node.id !== selectedNodeId && (!relationQuery.trim() || node.title.toLocaleLowerCase().includes(relationQuery.trim().toLocaleLowerCase()))).slice(0, 40).map((node) => <button key={node.id} aria-label={`关联到 ${node.title}`} onClick={() => {
        useDocumentStore.getState().addArrow(selectedNodeId, node.id)
        setRelationPickerOpen(false)
        setRelationQuery('')
      }}><strong>{node.title}</strong><span>创建从“{selectedNode?.title}”到此主题的关联线</span></button>)}</div></div>}
      <NodeContextMenu onCommand={command} isRoot={isRoot} hasClipboard={Boolean(useDocumentStore.getState().clipboard)}>
        {editorView === 'outline' ? <OutlineEditor
          root={viewRoot}
          documentTitle={document.title}
          onRenameDocument={(title) => renameDocument(document.id, title)}
          onOpenDetails={(nodeId) => {
            setSelectedNode(nodeId)
            setInspectorOpen(true)
          }}
          showNumbering={outlineNumbering}
        /> : <main
          className={`mindmap-stage ${fileDropTargetId ? 'is-file-dragging' : ''} ${isPanning ? 'is-panning' : ''}`}
          tabIndex={0}
          onPointerDownCapture={(event) => {
            const target = event.target as HTMLElement
            if (!(event.target as HTMLElement).isContentEditable) event.currentTarget.focus({ preventScroll: true })
            const anchor = adapterRef.current?.resolveNode(target)
            if (event.button === 0 && event.shiftKey && anchor) {
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              const current = useSelectionStore.getState().selectedNodeIds
              const next = current.includes(anchor.id) ? current.filter((id) => id !== anchor.id) : [...current, anchor.id]
              setSelectedNodes(next, next.includes(anchor.id) ? anchor.id : next.at(-1))
              adapterRef.current?.setSelections(next)
              return
            }
            if (event.button === 0 && selectedNodeIds.length > 1 && adapterRef.current?.resolveNode(target)) {
              adapterRef.current.setSelections([])
            }
            if (event.button === 1) {
              event.preventDefault()
              event.nativeEvent.stopImmediatePropagation()
              panPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture(event.pointerId)
              setIsPanning(true)
              return
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
            adapterRef.current?.beginEdit(anchor.id, { x: event.clientX, y: event.clientY })
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
            // Keep focus and the browser's text selection inside the inline editor.
            // Focusing the stage here would discard a drag-selected text range before
            // the user can delete it with Backspace.
            if ((event.target as HTMLElement).closest('#input-box[contenteditable]')) return
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (event.shiftKey && anchor) {
              event.preventDefault()
              event.stopPropagation()
              return
            }
            event.currentTarget.focus({ preventScroll: true })
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
          {!fileDropTargetId && <button className="canvas-onboarding-tip" onClick={() => setHelpOpen(true)}><BookOpen size={15} /><span>{countNodes(document.root) === 1 ? '选中中心主题，按 Tab 添加第一个分支' : '双击编辑 · Shift 点击多选 · 空白处拖框选择 · 中键平移'}</span><kbd>Ctrl /</kbd></button>}
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
        </main>}
      </NodeContextMenu>
      {editorView === 'mindmap' && selectedNodeId && !presentationMode && <div className="map-selection-toolbar" role="toolbar" aria-label="主题操作">
        <strong>{selectedNodeIds.length > 1 ? `已选 ${selectedNodeIds.length} 项` : selectedNode?.title || '当前主题'}</strong>
        {selectedNodeIds.length === 1 && <>
          <button onClick={() => command('sibling')} disabled={isRoot} title="Enter"><Plus size={14} />同级</button>
          <button onClick={() => command('child')} title="Tab"><Plus size={14} />下级</button>
          <button onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { taskStatus: selectedNode.taskStatus === 'none' ? 'todo' : 'none' })}><Check size={14} />待办</button>
          <button onClick={() => {
            setInspectorOpen(true)
            if (selectedNode) setDescriptionFocusRequest({ nodeId: selectedNode.id, nonce: Date.now() })
          }}><PanelRight size={14} />描述</button>
          <i />
          <button className={selectedNode?.style.fontWeight === '700' ? 'active' : ''} aria-label="主题加粗" title="加粗" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, fontWeight: selectedNode.style.fontWeight === '700' ? undefined : '700' } })}><Bold size={14} /></button>
          <button className={selectedNode?.style.fontStyle === 'italic' ? 'active' : ''} aria-label="主题斜体" title="斜体" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, fontStyle: selectedNode.style.fontStyle === 'italic' ? undefined : 'italic' } })}><Italic size={14} /></button>
          <button className={selectedNode?.style.textDecoration === 'underline' ? 'active' : ''} aria-label="主题下划线" title="下划线" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, textDecoration: selectedNode.style.textDecoration === 'underline' ? undefined : 'underline' } })}><Underline size={14} /></button>
          {!isRoot && <button onClick={() => setRelationPickerOpen(true)}><Link2 size={14} />连接</button>}
        </>}
        {!isRoot && <button className="danger" onClick={() => {
          if (selectedNodeIds.length > 1) useDocumentStore.getState().removeMany(selectedNodeIds)
          else command('remove')
          setSelectedNode(undefined)
        }}><Trash2 size={14} />删除</button>}
      </div>}
      {presentationMode && <button className="presentation-exit" onClick={() => setPresentationMode(false)}><X size={16} />退出演示</button>}
      {inspectorOpen && <><div className="inspector-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" onPointerDown={startInspectorResize} /><Suspense fallback={<aside className="node-inspector"><div className="inspector-empty">正在打开节点详情…</div></aside>}><NodeInspector key={selectedNode?.id ?? 'empty'} node={selectedNode} documentId={document.id} close={() => setInspectorOpen(false)} focusNoteRequest={descriptionFocusRequest} /></Suspense></>}
      <HistoryDialog document={document} open={historyOpen} onOpenChange={setHistoryOpen} />
      <ImportMarkdownDialog open={importOpen} onOpenChange={setImportOpen} onImport={importMarkdown} onImportFile={importStructuredFile} />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
