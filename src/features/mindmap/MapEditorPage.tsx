import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft, Bold, BookOpen, Braces, Check, CheckSquare, ChevronRight, CircleAlert, CircleHelp, Copy, Focus, Hash, History, ImagePlus, Italic, ListTree,
  Eye, FileDown, FileUp, ImageDown, Link2, Maximize2, Minus, MoreHorizontal, Palette, PanelRight,
  Presentation, Network, Plus, Redo2, Search, Trash2, Underline, Undo2, X, ZoomIn, ZoomOut, MoveRight,
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
import { MindMapTextToolbar } from './MindMapTextToolbar'
import { NodeOrderMenu } from './NodeOrderMenu'
import type { NodeOrderAction } from '../../utils/nodeOrder'
import { HistoryDialog, ImportMarkdownDialog } from './EditorDialogs'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { isPdfFile, paperRepository } from '../../repositories/paperRepository'
import { loadPdfDocument } from '../../services/pdf/pdfParser'
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
import { NodeSources } from '../paper/NodeSources'
import { KnowledgeFeedback } from '../paper/knowledgeFeedback'
import { knowledgeAction, useKnowledgeFeedbackStore } from '../../stores/knowledgeFeedbackStore'
import { ANNOTATION_DRAG_TYPE, paperKnowledgeService, parseAnnotationReference } from '../../services/paper/paperKnowledgeService'
import { flushLocalPersistence, watchDocumentEditing } from '../../services/persistence/localPersistence'
import { useDataSafetyStore } from '../../stores/dataSafetyStore'
import { MultiMapMenu } from './MultiMapMenu'
import { DeviceSyncDialog } from '../sync/DeviceSyncDialog'
import { findBacklinks, matchingDocuments, wikiLinkAtPoint } from '../../utils/wikiLinks'
import { DocumentTitleInput } from '../documentLinks/DocumentTitleInput'
import { DocumentLinks } from '../documentLinks/DocumentLinks'
import '../paper/paper-knowledge.css'
import 'mind-elixir/style.css'

const NodeInspector = lazy(() => import('../nodeInspector/NodeInspector').then((module) => ({ default: module.NodeInspector })))
const PaperReaderPage = lazy(() => import('../paper/PaperReaderPage').then((module) => ({ default: module.PaperReaderPage })))

const saveLabels = {
  saving: { label: '正在保存…', icon: <span className="sync-dot" /> },
  local: { label: '已保存到本地', icon: <Check size={14} /> },
  error: { label: '保存失败', icon: <CircleAlert size={14} /> },
}

function flattenNodes(root: NodeData): NodeData[] {
  return [root, ...root.children.flatMap(flattenNodes)]
}

function flattenVisibleNodes(root: NodeData): NodeData[] {
  return [root, ...(root.collapsed ? [] : root.children.flatMap(flattenVisibleNodes))]
}

function canCreateSummary(root: NodeData, nodeIds: string[]) {
  if (nodeIds.length < 2) return false
  const matches = nodeIds.map((nodeId) => findParent(root, nodeId))
  if (matches.some((match) => !match)) return false
  const parentId = matches[0]!.parent.id
  if (matches.some((match) => match!.parent.id !== parentId)) return false
  const indexes = [...new Set(matches.map((match) => match!.index))].sort((a, b) => a - b)
  return indexes.length === nodeIds.length && indexes.at(-1)! - indexes[0] + 1 === indexes.length
}

export function MapEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canvasRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MindMapEngineAdapter | undefined>(undefined)
  const composingRef = useRef(false)
  const pendingEditRef = useRef<string | undefined>(undefined)
  const pendingRevealRef = useRef<string | undefined>(undefined)
  const panPointerRef = useRef<{ pointerId: number; x: number; y: number; viaSpace: boolean } | undefined>(undefined)
  const boxSelectionGestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | undefined>(undefined)
  const stopPanRef = useRef<(() => void) | undefined>(undefined)
  const spacePressedRef = useRef(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const handledNavigationRef = useRef('')
  const focusedNavigationRef = useRef('')
  const readingFocusRef = useRef(false)
  const [engineReady, setEngineReady] = useState(false)
  const [nodeAnchor, setNodeAnchor] = useState<NodeAnchor>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [orderMenuOpen, setOrderMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileDropTargetId, setFileDropTargetId] = useState<string>()
  const [relationPickerOpen, setRelationPickerOpen] = useState(false)
  const [relationSourceId, setRelationSourceId] = useState<string>()
  const [relationQuery, setRelationQuery] = useState('')
  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const [moveQuery, setMoveQuery] = useState('')
  const [manualReadOnly, setReadOnly] = useState(false)
  const editingDocumentId = useDataSafetyStore((state) => state.editingDocumentId)
  const windowReadOnly = editingDocumentId !== id
  const readOnly = manualReadOnly || windowReadOnly
  const [readingPaper, setReadingPaper] = useState<{ paperId: string; annotationId?: string; nodeId?: string; locationKey: number }>()
  const [paperPickerOpen, setPaperPickerOpen] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [backlinksOpen, setBacklinksOpen] = useState(false)
  const [ambiguousLink, setAmbiguousLink] = useState<string>()
  const wikiBusyRef = useRef(false)
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
  const nodePaperRelations = usePaperStore((state) => state.relations)

  const documents = useDocumentStore((state) => state.documents)
  const nameError = useDocumentStore((state) => state.nameError)
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
  const editableDocumentId = document && !document.deletedAt ? document.id : undefined

  useEffect(() => {
    if (editableDocumentId && !manualReadOnly) return watchDocumentEditing(editableDocumentId)
  }, [editableDocumentId, manualReadOnly])

  const viewRoot = useMemo(() => document && (focusRootId ? findNode(document.root, focusRootId) : document.root), [document, focusRootId])
  const selectedNode = document && selectedNodeId ? findNode(document.root, selectedNodeId) : undefined
  const summaryAvailable = Boolean(document && canCreateSummary(document.root, selectedNodeIds))
  const unavailableMoveTargetIds = useMemo(() => {
    const unavailable = new Set<string>()
    if (!document || !movePickerOpen) return unavailable
    for (const nodeId of selectedNodeIds) {
      const node = findNode(document.root, nodeId)
      if (node) flattenNodes(node).forEach((item) => unavailable.add(item.id))
    }
    return unavailable
  }, [document, movePickerOpen, selectedNodeIds])
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
  const backlinks = useMemo(() => document ? findBacklinks(documents, document) : [], [documents, document])
  useEffect(() => { adapterRef.current?.setDocuments(documents) }, [documents, engineReady])

  const openWikiLink = async (name: string, targetId?: string) => {
    if (wikiBusyRef.current) return
    wikiBusyRef.current = true
    try {
      adapterRef.current?.finishEdit()
      const active = globalThis.document.activeElement
      if (active instanceof HTMLElement && active.closest('.editor-shell')) active.blur()
      // Rich-text-only edits can commit on the next microtask after engine blur.
      await Promise.resolve()
      const targets = matchingDocuments(useDocumentStore.getState().documents, name)
      if (!targetId && targets.length > 1) { setAmbiguousLink(name); return }
      if (!targets.length && (readOnly || presentationMode)) {
        useDocumentStore.setState({ nameError: `文档「${name}」尚未创建，请退出只读或演示模式后创建。` })
        return
      }
      const target = targetId ? targets.find((item) => item.id === targetId) : targets[0] ?? useDocumentStore.getState().createDocument(name)
      if (!target) return
      await flushLocalPersistence()
      setAmbiguousLink(undefined)
      setBacklinksOpen(true)
      if (target.id !== id) {
        setFocusRoot(undefined); setSelectedNode(undefined); setInspectorOpen(false)
        navigate(`/map/${target.id}`)
      }
    } catch {
      useSaveStore.getState().setStatus('error')
      useDocumentStore.setState({ nameError: '链接打开失败，当前编辑仍保留在内存中。请重试并检查本地保存状态。' })
    } finally { wikiBusyRef.current = false }
  }

  useEffect(() => {
    const counts = Object.fromEntries(Object.entries(markdownPaperSources).map(([nodeId, sources]) => [nodeId, sources.length]))
    adapterRef.current?.setSourceCounts(counts)
  }, [markdownPaperSources, engineReady, viewRoot])
  const openPaper = (paperId: string, annotationId?: string, ownerNodeId?: string) => {
    const candidates = nodePaperRelations.filter((item) => item.documentId === id && item.paperId === paperId && document && findNode(document.root, item.nodeId))
    const sourceNodeId = annotationId && annotationNodeRelations.find((source) => source.documentId === id && source.annotationId === annotationId && source.nodeId === selectedNodeId)?.nodeId
    const contextId = ownerNodeId ?? sourceNodeId ?? selectedNodeId
    const path = contextId && document ? getBreadcrumbs(document.root, contextId).reverse() : []
    const isLiterature = (nodeId: string) => !annotationNodeRelations.some((source) => source.documentId === id && source.nodeId === nodeId)
    const literature = path.map((node) => candidates.find((item) => item.nodeId === node.id && isLiterature(item.nodeId))).find(Boolean) ?? candidates.find((item) => isLiterature(item.nodeId))
    const nodeId = literature?.nodeId ?? ownerNodeId ?? sourceNodeId ?? candidates[0]?.nodeId
    setInspectorOpen(false); setPaperPickerOpen(false); setReadingPaper((previous) => ({ paperId, annotationId, nodeId, locationKey: (previous?.locationKey ?? 0) + 1 }))
  }
  const goToLinkedNode = (documentId: string, nodeId: string) => {
    setBacklinksOpen(false)
    if (documentId !== id) { navigate(`/map/${documentId}?nodeId=${encodeURIComponent(nodeId)}`); return }
    setFocusRoot(undefined); useDocumentStore.getState().revealNode(nodeId); setSelectedNode(nodeId)
    pendingRevealRef.current = nodeId
    requestAnimationFrame(() => { adapterRef.current?.select(nodeId); adapterRef.current?.reveal(nodeId) })
  }
  const splitOpen = Boolean(readingPaper)
  useEffect(() => {
    if (!engineReady) return
    const frame = requestAnimationFrame(() => setCanvasScale(adapterRef.current?.fit() ?? 1))
    return () => cancelAnimationFrame(frame)
  }, [splitOpen, engineReady])
  const linkToNode = (annotationId: string, nodeId: string) => {
    if (readOnly || !document) return
    void (async () => {
      let added: string[] = []
      await knowledgeAction(async () => {
      added = await paperKnowledgeService.linkAnnotations([annotationId], document.id, [nodeId])
      setSelectedNode(nodeId)
      return added
      }, '批注已关联到节点；节点内容保持不变', () => paperKnowledgeService.unlinkRelations(added))
    })()
  }

  useEffect(() => {
    if (id) openDocument(id)
    setReadingPaper(undefined)
    setPaperPickerOpen(false)
    return () => { setFocusRoot(undefined) }
  }, [id, openDocument, setFocusRoot])

  useEffect(() => {
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      spacePressedRef.current = false
      if (panPointerRef.current?.viaSpace) stopPanRef.current?.()
    }
    const stopInteraction = () => {
      spacePressedRef.current = false
      stopPanRef.current?.()
    }
    window.addEventListener('keyup', releaseSpace, true)
    window.addEventListener('blur', stopInteraction)
    return () => {
      window.removeEventListener('keyup', releaseSpace, true)
      window.removeEventListener('blur', stopInteraction)
      stopPanRef.current?.()
    }
  }, [])

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
    adapter.setReadOnly(readOnly || presentationMode)
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
    const revealId = pendingRevealRef.current
    if (revealId) {
      pendingRevealRef.current = undefined
      const scheduledFocus = focusRootId
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (useUiStore.getState().focusRootId !== scheduledFocus) return
        adapterRef.current?.reveal(revealId)
        setNodeAnchor(adapterRef.current?.anchorFor(revealId))
      }))
    }
  }, [document?.arrows, document?.summaries, engineReady, focusRootId, viewRoot, nameError])

  useEffect(() => {
    // Entering a topic is a reading action. A zoom fitted to the entire map
    // can make even a single paragraph microscopic after focus navigation.
    if (!engineReady) return
    if (focusRootId) setCanvasScale(adapterRef.current?.actualSize() ?? 1)
    else if (readingFocusRef.current) setCanvasScale(adapterRef.current?.fit() ?? 1)
    readingFocusRef.current = Boolean(focusRootId)
  }, [engineReady, focusRootId])

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
    if (selectedNodeId) {
      const frame = requestAnimationFrame(() => adapterRef.current?.select(selectedNodeId))
      return () => cancelAnimationFrame(frame)
    }
    adapterRef.current?.clearSelection()
  }, [engineReady, selectedNodeId, selectedNodeIds])

  useEffect(() => {
    if (!engineReady || !viewRoot || !targetNodeId || focusRootId) return
    const navigationKey = `${id ?? ''}:${targetNodeId}`
    if (focusedNavigationRef.current === navigationKey) return
    const path = getBreadcrumbs(viewRoot, targetNodeId)
    if (!path.length || path.slice(0, -1).some((node) => node.collapsed)) return
    focusedNavigationRef.current = navigationKey
    let revealFrame = 0
    const frame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        if (useUiStore.getState().focusRootId) return
        adapterRef.current?.reveal(targetNodeId)
        setNodeAnchor(adapterRef.current?.anchorFor(targetNodeId))
      })
    })
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(revealFrame) }
  }, [engineReady, id, targetNodeId, viewRoot, focusRootId])

  useEffect(() => {
    if (engineReady && editorView === 'mindmap') {
      setNodeAnchor(selectedNodeId ? adapterRef.current?.anchorFor(selectedNodeId) : undefined)
    }
  }, [editorView, engineReady, selectedNodeId])

  useEffect(() => {
    const anchorId = nodeAnchor?.id
    if (!engineReady || editorView !== 'mindmap' || !anchorId) return
    return adapterRef.current?.watchAnchor(anchorId, (next) => {
      setNodeAnchor((previous) => {
        if (previous?.id !== anchorId) return previous
        if (next && previous.left === next.left && previous.top === next.top
          && previous.width === next.width && previous.height === next.height
          && previous.hasChildren === next.hasChildren && previous.collapsed === next.collapsed) return previous
        return next
      })
    })
  }, [editorView, engineReady, nodeAnchor?.id])

  const editNewNode = useCallback((nodeId?: string) => {
    if (!nodeId) return
    if (editorView === 'mindmap') pendingEditRef.current = nodeId
    setSelectedNode(nodeId)
  }, [editorView, setSelectedNode])

  const moveSelectedSibling = useCallback(async (action: NodeOrderAction) => {
    if (readOnly || presentationMode) return
    const selection = useSelectionStore.getState()
    const ids = [...selection.selectedNodeIds]
    const activeId = selection.selectedNodeId
    const documentId = useDocumentStore.getState().activeDocumentId
    if (!activeId || !ids.length) return
    adapterRef.current?.finishEdit()
    const active = globalThis.document.activeElement
    if (active instanceof HTMLElement && active.isContentEditable) active.blur()
    // Read the latest committed tree, not a render snapshot of unfinished text.
    await Promise.resolve()
    if (useDocumentStore.getState().activeDocumentId !== documentId) return
    const result = useDocumentStore.getState().reorderSiblings(ids, action)
    if (result === 'summary-conflict') useKnowledgeFeedbackStore.setState({
      message: '此次排序会拆散已有概要，已保留原顺序。请同时选择概要中的全部同级主题再移动。', error: true, undo: undefined, busy: false,
    })
    if (result === 'moved') {
      setSelectedNodes(ids, activeId)
      adapterRef.current?.setSelections(ids)
    }
  }, [presentationMode, readOnly, setSelectedNodes])

  const command = useCallback((name: NodeCommand) => {
    const store = useDocumentStore.getState()
    const selection = useSelectionStore.getState().selectedNodeId
    const currentDocument = store.documents.find((item) => item.id === store.activeDocumentId)
    if (!selection || !currentDocument) return
    if ((readOnly || presentationMode) && name !== 'focus') return
    switch (name) {
      case 'child': editNewNode(store.insertChild(selection)); break
      case 'sibling': editNewNode(store.insertSibling(selection)); break
      case 'promote': store.promote(selection); break
      case 'order': window.setTimeout(() => setOrderMenuOpen(true), 0); break
      case 'moveUp': case 'moveDown': case 'moveFirst': case 'moveLast': void moveSelectedSibling(name); break
      case 'remove': if (selection !== currentDocument.root.id) { store.remove(selection); setSelectedNode(undefined) } break
      case 'removeOnly': if (selection !== currentDocument.root.id) { store.removeOnly(selection); setSelectedNode(undefined) } break
      case 'duplicate': editNewNode(store.duplicate(selection)); break
      case 'copy': store.copy(selection); break
      case 'cut': store.cut(selection); break
      case 'paste': editNewNode(store.paste(selection)); break
      case 'toggle': if (editorView === 'outline') store.toggleCollapsed(selection); else adapterRef.current?.toggleExpanded(selection); break
      case 'toggleSiblings': store.toggleSiblingChildren(selection); break
      case 'focus': setInspectorOpen(false); setFocusRoot(selection); break
      default: setInspectorOpen(true)
    }
  }, [editNewNode, editorView, moveSelectedSibling, presentationMode, readOnly, setFocusRoot, setInspectorOpen, setSelectedNode])

  const changeEditorView = (view: 'outline' | 'mindmap') => {
    setEditorView(view)
    setRelationPickerOpen(false)
    setRelationSourceId(undefined)
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
      if (target?.closest('.embedded-reader, [role="dialog"]')) return
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

  async function attachImageToNode(file: File, nodeId: string) {
    if (!document || !file.type.startsWith('image/') || readOnly || presentationMode) return false
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
      reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image()
      image.onload = () => {
        const width = Math.min(320, Math.max(80, image.naturalWidth))
        resolve({ width, height: Math.max(45, Math.round(width * image.naturalHeight / Math.max(1, image.naturalWidth))) })
      }
      image.onerror = () => resolve({ width: 180, height: 120 })
      image.src = url
    })
    useDocumentStore.getState().updateNode(nodeId, { image: { url, ...size } })
    setSelectedNode(nodeId)
    return true
  }

  const attachFiles = async (files: FileList | File[], nodeId: string) => {
    if (!document || readOnly || presentationMode) return
    const store = useDocumentStore.getState()
    // A file can be dropped immediately after a direct route opens, before the route effect
    // has marked this document active. Make the command self-contained instead of timing-dependent.
    if (store.activeDocumentId !== document.id) store.openDocument(document.id)
    const target = findNode(store.documents.find((item) => item.id === document.id)?.root ?? document.root, nodeId)
    if (!target) return
    const attachments = []
    let openedNodeId = nodeId
    let insertedImage = false
    let shouldOpenInspector = false
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/') && !insertedImage) {
        insertedImage = await attachImageToNode(file, nodeId)
      }
      else if (isPdfFile(file)) {
        try {
          const header = await file.slice(0, 5).text()
          if (header !== '%PDF-') throw new Error('文件不是有效的 PDF。')
          const checked = await loadPdfDocument(file)
          await checked.destroy()
          const paper = await paperRepository.createOrReuse(file, userId)
          const paperNode = await paperKnowledgeService.createLiteratureNode(paper, document.id, nodeId)
          openedNodeId = paperNode.id
          openPaper(paper.id, undefined, paperNode.id)
        } catch (reason) {
          window.alert(`“${file.name}”导入失败：${reason instanceof Error ? reason.message : '请重试。'}`)
        }
      }
      else {
        attachments.push(await attachmentRepository.save(document.id, nodeId, file))
        shouldOpenInspector = true
      }
    }
    if (attachments.length) useDocumentStore.getState().updateNode(nodeId, { attachments: [...target.attachments, ...attachments] })
    setSelectedNode(openedNodeId)
    if (shouldOpenInspector) setInspectorOpen(true)
  }

  const attachImage = async (file?: File) => {
    const nodeId = useSelectionStore.getState().selectedNodeId
    if (file && nodeId) await attachImageToNode(file, nodeId)
  }

  const updateSelected = (patch: Partial<NodeData> | ((node: NodeData) => Partial<NodeData>)) => {
    const ids = useSelectionStore.getState().selectedNodeIds
    if (ids.length) useDocumentStore.getState().updateMany(ids, patch)
  }

  const selectAllVisible = () => {
    if (!viewRoot) return
    const ids = flattenVisibleNodes(viewRoot).map((node) => node.id)
    setSelectedNodes(ids, ids.at(-1))
    adapterRef.current?.setSelections(ids)
  }

  const extendSelection = (direction: -1 | 1) => {
    if (!viewRoot) return
    const visible = flattenVisibleNodes(viewRoot)
    const selection = useSelectionStore.getState()
    const activeId = selection.selectedNodeId ?? visible[0]?.id
    const index = visible.findIndex((node) => node.id === activeId)
    const next = visible[Math.max(0, Math.min(visible.length - 1, index + direction))]
    if (!next || next.id === activeId) return
    const ids = selection.selectedNodeIds.includes(next.id)
      ? selection.selectedNodeIds.filter((id) => id !== activeId)
      : [...selection.selectedNodeIds, next.id]
    setSelectedNodes(ids, next.id)
    adapterRef.current?.setSelections(ids)
  }

  const showBranchDepth = (levels: number) => {
    if (!document || !selectedNodeId) return
    const branch = findNode(document.root, selectedNodeId)
    if (!branch) return
    const depths = new Map<string, number>()
    const visit = (node: NodeData, depth: number) => {
      depths.set(node.id, depth)
      node.children.forEach((child) => visit(child, depth + 1))
    }
    visit(branch, 0)
    useDocumentStore.getState().updateMany([...depths.keys()], (node) => ({
      collapsed: node.children.length > 0 ? depths.get(node.id)! >= levels : false,
    }))
  }

  const toggleAllBranches = () => {
    if (!viewRoot) return
    const branches = flattenNodes(viewRoot).filter((node) => node.id !== viewRoot.id && node.children.length > 0)
    const collapse = branches.some((node) => !node.collapsed)
    useDocumentStore.getState().updateMany(branches.map((node) => node.id), { collapsed: collapse })
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const editing = target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))
    if (editing) {
      const mod = event.ctrlKey || event.metaKey
      const selectionText = () => window.getSelection()?.toString() ?? ''
      const wrapSelection = (tag: 'code' | 'span', cloze = false) => {
        const selection = window.getSelection()
        if (!selection?.rangeCount || selection.isCollapsed || !target.contains(selection.anchorNode) || !target.contains(selection.focusNode)) return
        const range = selection.getRangeAt(0)
        const wrapper = globalThis.document.createElement(tag)
        if (cloze) wrapper.dataset.cloze = 'true'
        try {
          range.surroundContents(wrapper)
          selection.removeAllRanges()
          const next = globalThis.document.createRange()
          next.selectNodeContents(wrapper)
          selection.addRange(next)
        } catch { /* Mixed inline selections are left unchanged instead of corrupting the topic. */ }
      }
      if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); globalThis.document.execCommand('bold'); return }
      if (mod && event.key.toLowerCase() === 'i') { event.preventDefault(); globalThis.document.execCommand('italic'); return }
      if (mod && event.key.toLowerCase() === 'u') { event.preventDefault(); globalThis.document.execCommand('underline'); return }
      if (mod && event.key === 'Enter') { event.preventDefault(); globalThis.document.execCommand('strikeThrough'); return }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); wrapSelection('span', true); return }
      if (event.altKey && event.key.toLowerCase() === 'l' && selectionText()) { event.preventDefault(); wrapSelection('code'); return }
      if (event.altKey && ['d', 'r', 'y', 'g', 'b', 'p'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        const colors: Record<string, string> = { d: '#38443d', r: '#b2473e', y: '#9a6d00', g: '#39704d', b: '#356a8a', p: '#76518f' }
        globalThis.document.execCommand('foreColor', false, colors[event.key.toLowerCase()])
        return
      }
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
    if (presentationMode || readOnly) {
      if (event.key === 'Escape') {
        setRelationSourceId(undefined)
        adapterRef.current?.clearSelection()
        setSelectedNode(undefined)
        setSearchOpen(false)
      }
      return
    }
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) useDocumentStore.getState().redo(); else useDocumentStore.getState().undo(); return }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); useDocumentStore.getState().redo(); return }
    if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); return }
    if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAllVisible(); return }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); if (selectedNodeIds.length > 1) useDocumentStore.getState().copyMany(selectedNodeIds); else command('copy'); return }
    if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); if (selectedNodeIds.length > 1) useDocumentStore.getState().cutMany(selectedNodeIds); else command('cut'); return }
    // Ctrl/Cmd+V is handled by onPasteCapture so system clipboard images and
    // the app's copied topic branches can share the native paste path.
    if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); command('duplicate'); return }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'l') { event.preventDefault(); updateSelected((node) => ({ taskStatus: node.taskStatus === 'none' ? 'todo' : 'none' })); return }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); updateSelected((node) => ({ taskStatus: node.taskStatus === 'done' ? 'todo' : 'done' })); return }
    if (mod && event.shiftKey && event.key === 'Backspace') { event.preventDefault(); useDocumentStore.getState().removeMany(selectedNodeIds); setSelectedNode(undefined); return }
    if (mod && event.shiftKey && event.key === 'ArrowUp') { event.preventDefault(); void moveSelectedSibling('moveUp'); return }
    if (mod && event.shiftKey && event.key === 'ArrowDown') { event.preventDefault(); void moveSelectedSibling('moveDown'); return }
    if (event.shiftKey && event.key === 'ArrowUp') { event.preventDefault(); extendSelection(-1); return }
    if (event.shiftKey && event.key === 'ArrowDown') { event.preventDefault(); extendSelection(1); return }
    if (mod && event.altKey && ['1', '2', '3'].includes(event.key)) { event.preventDefault(); showBranchDepth(Number(event.key)); return }
    if (mod && event.altKey && event.shiftKey && event.key === '.') { event.preventDefault(); toggleAllBranches(); return }
    if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); updateSelected((node) => ({ style: { ...node.style, fontWeight: node.style.fontWeight === '700' ? undefined : '700' } })); return }
    if (mod && event.key.toLowerCase() === 'i') { event.preventDefault(); updateSelected((node) => ({ style: { ...node.style, fontStyle: node.style.fontStyle === 'italic' ? undefined : 'italic' } })); return }
    if (mod && event.key.toLowerCase() === 'u') { event.preventDefault(); updateSelected((node) => ({ style: { ...node.style, textDecoration: node.style.textDecoration === 'underline' ? undefined : 'underline' } })); return }
    if (mod && event.key === 'Enter') { event.preventDefault(); updateSelected((node) => ({ style: { ...node.style, textDecoration: node.style.textDecoration === 'line-through' ? undefined : 'line-through' } })); return }
    if (mod && (event.key === ']' || event.code === 'BracketRight')) { event.preventDefault(); command('focus'); return }
    if (mod && event.shiftKey && event.key === '.') { event.preventDefault(); command('toggleSiblings'); return }
    if ((event.altKey || mod) && event.key === '.') { event.preventDefault(); command('toggle'); return }
    if (event.altKey && event.key === 'Enter') { event.preventDefault(); imageInputRef.current?.click(); return }
    if (event.altKey && ['d', 'r', 'y', 'g', 'b', 'p'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      const colors: Record<string, string | undefined> = { d: undefined, r: '#b2473e', y: '#9a6d00', g: '#39704d', b: '#356a8a', p: '#76518f' }
      updateSelected((node) => ({ style: { ...node.style, color: colors[event.key.toLowerCase()] } }))
      return
    }
    if (event.key === '?') { event.preventDefault(); setHelpOpen(true); return }
    if (event.key === 'Enter') { event.preventDefault(); command('sibling'); return }
    if (event.key === 'Tab') { event.preventDefault(); if (event.shiftKey) command('promote'); else command('child'); return }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (selectedNodeIds.length > 1) useDocumentStore.getState().removeMany(selectedNodeIds)
      else command('remove')
      setSelectedNode(undefined)
      return
    }
    if (event.key === 'Escape') { setRelationSourceId(undefined); adapterRef.current?.clearSelection(); setSelectedNode(undefined); setSearchOpen(false) }
  }

  if (!document || !viewRoot) return <main className="not-found"><strong>没有找到这份文档</strong><Link to="/library">返回知识库</Link></main>

  const activeSave = saveLabels[saveStatus]
  const isRoot = selectedNodeId === document.root.id

  return (
    <div className={`editor-shell ${inspectorOpen && !readingPaper ? 'with-inspector' : ''} ${readingPaper && !presentationMode ? 'with-paper-reader' : ''} ${presentationMode ? 'presentation-mode' : ''}`} style={inspectorOpen && !readingPaper && !presentationMode ? { gridTemplateColumns: `minmax(480px, 1fr) ${inspectorWidth}px` } : undefined}>
      <header className="editor-toolbar">
        <button className="icon-button" onClick={() => navigate('/library')} aria-label="返回知识库" title="返回知识库"><ArrowLeft size={19} /></button>
        <div className="toolbar-divider" />
        <DocumentTitleInput className="document-title-input" value={document.title} aria-label="文档名称" disabled={readOnly || presentationMode} onCommit={(title) => renameDocument(document.id, title)} />
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => { void attachImage(event.target.files?.[0]); event.target.value = '' }} />
        <div className={`save-status status-${saveStatus}`}>{activeSave.icon}<span>{activeSave.label}</span></div>
        <span className="document-node-count">{countNodes(document.root)} 个节点</span>
        <div className="editor-view-switch" aria-label="切换编辑视图">
          <button className={editorView === 'outline' ? 'active' : ''} onClick={() => changeEditorView('outline')} title="大纲笔记"><ListTree size={15} /><span>大纲</span></button>
          <button className={editorView === 'mindmap' ? 'active' : ''} onClick={() => changeEditorView('mindmap')} title="思维导图"><Network size={15} /><span>导图</span></button>
        </div>
        <div className="toolbar-spacer" />
        <MultiMapMenu currentId={document.id} />
        <DeviceSyncDialog />
        {windowReadOnly && !manualReadOnly && <span className="document-window-readonly" role="status" title="这份导图正在其他窗口编辑。本窗口可阅读并同步最新内容；另一个窗口关闭或返回知识库后，将自动接续编辑。">只读 · 等待其他窗口结束编辑</span>}
        {selectedNodeId && !readOnly && !presentationMode && <NodeOrderMenu root={document.root} nodeIds={selectedNodeIds} onMove={(action) => void moveSelectedSibling(action)} open={orderMenuOpen} onOpenChange={setOrderMenuOpen} />}
        <button className={`toolbar-action-button ${backlinksOpen && editorView === 'mindmap' ? 'active' : ''}`} aria-label="双向链接与反向引用" title="输入 [[文档名称]]，双击高亮文字打开文档" onClick={() => {
          if (editorView === 'outline') globalThis.document.querySelector('.outline-document .document-backlinks')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          else setBacklinksOpen((value) => !value)
        }}><Link2 size={16} /><span>引用{backlinks.length > 0 ? ` ${backlinks.length}` : ''}</span></button>
        <button className={`toolbar-action-button ${readingPaper ? 'active' : ''}`} aria-label="分栏阅读论文" title="打开论文分栏 · 也可直接把 PDF 拖到导图" onClick={() => setPaperPickerOpen((value) => !value)}><BookOpen size={16} /><span>论文分栏</span></button>
        <button className="toolbar-action-button add-topic-button" disabled={readOnly} onClick={() => {
          if (!selectedNodeId) setSelectedNode(document.root.id)
          window.setTimeout(() => command('child'), 0)
        }} aria-label="新增子主题" title="在选中主题下添加子主题（Tab）"><Plus size={16} /><span>子主题</span></button>
        {editorView === 'mindmap' && !readOnly && !focusRootId && selectedNodeId && selectedNodeId !== document.root.id && <button className={`toolbar-action-button ${relationPickerOpen ? 'active' : ''}`} onClick={() => setRelationPickerOpen((open) => !open)} aria-label="创建关联线" title="把当前主题关联到另一个主题"><Link2 size={16} /><span>关联</span></button>}
        <button className={`toolbar-action-button ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="搜索" title="搜索节点（Ctrl + F）"><Search size={16} /><span>搜索</span></button>
        <button className={`toolbar-action-button ${inspectorOpen ? 'active' : ''}`} disabled={readOnly} onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="节点详情" title={readOnly ? '只读浏览时不可编辑节点详情' : '打开节点详情'}><PanelRight size={16} /><span>详情</span></button>
        <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="操作指南" title="操作指南（?）"><CircleHelp size={18} /></button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button className="icon-button" aria-label="更多" title="导入、导出与历史"><MoreHorizontal size={19} /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end">
            <DropdownMenu.Label className="dropdown-label">导入与导出</DropdownMenu.Label>
            <DropdownMenu.Item className="dropdown-item" disabled={readOnly} onSelect={() => window.setTimeout(() => setImportOpen(true), 0)}><FileUp size={16} />导入文件</DropdownMenu.Item>
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
              <DropdownMenu.RadioItem className="dropdown-item" value="paper" disabled={readOnly}><Palette size={16} />纸张绿</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="ocean" disabled={readOnly}><Palette size={16} />海洋蓝</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="warm" disabled={readOnly}><Palette size={16} />暖棕色</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="dropdown-item" value="mono" disabled={readOnly}><Palette size={16} />黑白灰</DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={document.compactMap ?? false} disabled={readOnly} onCheckedChange={(compactMap) => updateMapAppearance(document.id, { mapTheme: document.mapTheme, compactMap })}><Maximize2 size={16} />紧凑布局</DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={manualReadOnly} onCheckedChange={(value) => { setReadOnly(value); if (value) { setInspectorOpen(false); setRelationPickerOpen(false); setRelationSourceId(undefined) } }}><Eye size={16} />只读浏览</DropdownMenu.CheckboxItem>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => { changeEditorView('mindmap'); setPresentationMode(true); setInspectorOpen(false) }}><Presentation size={16} />演示模式</DropdownMenu.Item>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Label className="dropdown-label">大纲显示</DropdownMenu.Label>
            <DropdownMenu.CheckboxItem className="dropdown-item" checked={outlineNumbering} onCheckedChange={(checked) => {
              setOutlineNumbering(checked)
              window.localStorage.setItem('zhijian-outline-numbering', String(checked))
            }}><Hash size={16} />主题编号</DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator className="context-separator" />
            <DropdownMenu.Item className="dropdown-item" disabled={readOnly} onSelect={() => setHistoryOpen(true)}><History size={16} />历史版本</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      {paperPickerOpen && <div className="paper-picker"><strong>左侧论文 · 右侧导图</strong><p>把 PDF 文件直接拖到导图，即可创建文献节点。双击文献节点打开分栏。</p><button onClick={() => navigate('/annotations')}>论文与批注管理 →</button>{papers.map((paper) => <button key={paper.id} onClick={() => openPaper(paper.id)}>📄 {paper.title}</button>)}</div>}
      {breadcrumbs.length > 0 && <div className="focus-breadcrumb"><Focus size={14} />{breadcrumbs.map((node, index) => <span key={node.id}><button title={node.title.split('\n')[0]} onClick={() => index === 0 ? setFocusRoot(undefined) : setFocusRoot(node.id)}>{node.title.split('\n')[0]}</button>{index < breadcrumbs.length - 1 && <ChevronRight size={13} />}</span>)}</div>}
      {searchOpen && <div className="editor-search-panel"><div className="editor-search"><Search size={16} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索节点、标签或笔记…" /><button className="icon-button" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={16} /></button></div>{searchQuery && <div className="editor-search-results">{searchResults.map((result) => <button key={result.nodeId} onClick={() => {
        useDocumentStore.getState().revealNode(result.nodeId)
        setSelectedNode(result.nodeId)
        setFocusRoot(undefined)
        if (editorView === 'mindmap') pendingRevealRef.current = result.nodeId
        setSearchOpen(false)
        setSearchQuery('')
      }}><strong>{result.nodeTitle}</strong><span>{result.field === 'note' ? '笔记' : result.field === 'tag' ? '标签' : '标题'} · {result.excerpt}</span></button>)}{!searchResults.length && <p>没有找到相关节点</p>}</div>}</div>}
      {relationPickerOpen && selectedNodeId && <div className="editor-search-panel relation-picker"><div className="editor-search"><Link2 size={16} /><input autoFocus value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="搜索要关联的主题…" /><button className="icon-button" onClick={() => { setRelationPickerOpen(false); setRelationQuery('') }}><X size={16} /></button></div><div className="editor-search-results">{flattenNodes(document.root).filter((node) => node.id !== selectedNodeId && (!relationQuery.trim() || node.title.toLocaleLowerCase().includes(relationQuery.trim().toLocaleLowerCase()))).slice(0, 40).map((node) => <button key={node.id} aria-label={`关联到 ${node.title}`} onClick={() => {
        useDocumentStore.getState().addArrow(selectedNodeId, node.id)
        setRelationPickerOpen(false)
        setRelationQuery('')
      }}><strong>{node.title}</strong><span>创建从“{selectedNode?.title}”到此主题的关联线</span></button>)}</div></div>}
      {movePickerOpen && selectedNodeIds.length > 0 && <div className="editor-search-panel relation-picker move-picker"><div className="editor-search"><MoveRight size={16} /><input autoFocus value={moveQuery} onChange={(event) => setMoveQuery(event.target.value)} placeholder="搜索新的上级主题…" /><button className="icon-button" aria-label="关闭移动面板" onClick={() => { setMovePickerOpen(false); setMoveQuery('') }}><X size={16} /></button></div><div className="editor-search-results">{flattenNodes(document.root).filter((node) => !unavailableMoveTargetIds.has(node.id) && (!moveQuery.trim() || node.title.toLocaleLowerCase().includes(moveQuery.trim().toLocaleLowerCase()))).slice(0, 40).map((node) => <button key={node.id} aria-label={`移动到 ${node.title}`} onClick={() => {
        useDocumentStore.getState().moveManyRelative(selectedNodeIds, node.id, 'inside')
        setMovePickerOpen(false)
        setMoveQuery('')
      }}><strong>{node.title}</strong><span>将已选 {selectedNodeIds.length} 个主题移到此主题下</span></button>)}</div></div>}
      <NodeContextMenu onCommand={command} isRoot={isRoot} hasClipboard={Boolean(useDocumentStore.getState().clipboard)} disabled={readOnly || presentationMode}>
        {editorView === 'outline' ? <OutlineEditor
          root={viewRoot}
          onReorder={moveSelectedSibling}
          documentTitle={document.title}
          onRenameDocument={(title) => renameDocument(document.id, title)}
          onOpenDetails={(nodeId) => {
            setSelectedNode(nodeId)
            setInspectorOpen(true)
          }}
          onDropFiles={(files, nodeId) => void attachFiles(files, nodeId)}
          onOpenPaperNode={(nodeId) => {
            const relation = nodePaperRelations.find((item) => item.documentId === document.id && item.nodeId === nodeId)
            if (relation) openPaper(relation.paperId, undefined, nodeId)
          }}
          paperNodeIds={nodePaperRelations.filter((item) => item.documentId === document.id).map((item) => item.nodeId)}
          showNumbering={outlineNumbering}
          readOnly={readOnly || presentationMode}
          onOpenWikiLink={(name) => void openWikiLink(name)}
          backlinks={<DocumentLinks document={document} documents={documents} onGoToNode={goToLinkedNode} />}
        /> : <main
          className={`mindmap-stage ${fileDropTargetId ? 'is-file-dragging' : ''} ${isPanning ? 'is-panning' : ''}`}
          tabIndex={0}
          onPointerDownCapture={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.node-quick-actions, .canvas-controls')) return
            // The engine's selection area treats its expander as outside the
            // topic. Keep selection until the expander's click toggles children.
            if (target.closest('.me-epd')) { event.stopPropagation(); return }
            if (!target.closest('[contenteditable="true"]')) event.currentTarget.focus({ preventScroll: true })
            const anchor = adapterRef.current?.resolveNode(target)
            const blankCanvasPress = event.pointerType === 'mouse' && event.button === 0
              && !anchor
              && Boolean(target.closest('.mindmap-canvas'))
              && !target.closest('button, input, textarea, select, a, [contenteditable="true"]')
            boxSelectionGestureRef.current = blankCanvasPress
              ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
              : undefined
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
            if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) {
              const viaSpace = event.button === 0
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              stopPanRef.current?.()
              panPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viaSpace }
              setIsPanning(true)
              const move = (pointerEvent: PointerEvent) => {
                const pan = panPointerRef.current
                if (pan?.pointerId !== pointerEvent.pointerId) return
                if (pointerEvent.cancelable) pointerEvent.preventDefault()
                pointerEvent.stopImmediatePropagation()
                adapterRef.current?.panBy(pointerEvent.clientX - pan.x, pointerEvent.clientY - pan.y)
                panPointerRef.current = { ...pan, x: pointerEvent.clientX, y: pointerEvent.clientY }
              }
              const stop = (pointerEvent?: PointerEvent) => {
                const pan = panPointerRef.current
                if (pointerEvent && pan?.pointerId !== pointerEvent.pointerId) return
                panPointerRef.current = undefined
                if (pan?.viaSpace) spacePressedRef.current = false
                setIsPanning(false)
                window.removeEventListener('pointermove', move, true)
                window.removeEventListener('pointerup', stop, true)
                window.removeEventListener('pointercancel', stop, true)
                stopPanRef.current = undefined
              }
              stopPanRef.current = () => stop()
              window.addEventListener('pointermove', move, { capture: true, passive: false })
              window.addEventListener('pointerup', stop, true)
              window.addEventListener('pointercancel', stop, true)
              return
            }
            if (
              event.pointerType === 'mouse' && event.button === 0
              && !anchor
              && target.closest('.mindmap-canvas')
              && !target.classList.contains('map-container')
              && !target.closest('button, input, textarea, select, a, [contenteditable="true"]')
            ) {
              // Transparent connector/SVG layers are visually empty canvas,
              // but Mind Elixir normally refuses to begin its marquee there.
              // Forward the press to the actual canvas so box selection works
              // consistently anywhere that looks blank to the user.
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              adapterRef.current?.beginBoxSelection(event.nativeEvent)
              return
            }
          }}
          onAuxClickCapture={(event) => { if (event.button === 1) event.preventDefault() }}
          onKeyDownCapture={(event) => {
            const name = (event.target as HTMLElement).closest<HTMLElement>('[data-wiki-name]')?.dataset.wikiName
            if (name && event.key === 'Enter' && !(event.target as HTMLElement).closest('[contenteditable="true"]')) {
              event.preventDefault(); event.stopPropagation(); void openWikiLink(name); return
            }
            if (event.code === 'Space' && !(event.target as HTMLElement).matches('input, textarea, [contenteditable="true"]')) {
              spacePressedRef.current = true
              event.preventDefault()
              return
            }
            handleKeyDown(event)
          }}
          onKeyUpCapture={(event) => { if (event.code === 'Space') spacePressedRef.current = false }}
          onCompositionStartCapture={() => { composingRef.current = true }}
          onCompositionEndCapture={() => { composingRef.current = false }}
          onPasteCapture={(event) => {
            if (readOnly || presentationMode) return
            const reference = parseAnnotationReference(event.clipboardData.getData('text/plain'))
            if (reference && !(event.target as HTMLElement).closest('[contenteditable], input, textarea')) {
              event.preventDefault(); event.stopPropagation()
              const target = adapterRef.current?.resolveNode(event.target)?.id ?? selectedNodeId
              if (target) linkToNode(reference, target)
              else void knowledgeAction(async () => { throw new Error('请先选中目标节点，再粘贴批注引用。') }, '')
              return
            }
            const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'))
              ?? [...event.clipboardData.items]
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .find((file): file is File => Boolean(file))
            if (!image) {
              const target = event.target as HTMLElement
              if (!target.isContentEditable && !target.closest('[contenteditable="true"]') && useDocumentStore.getState().clipboard) {
                event.preventDefault()
                event.stopPropagation()
                command('paste')
              }
              return
            }
            const anchor = adapterRef.current?.resolveNode(event.target)
            const targetId = anchor?.id ?? useSelectionStore.getState().selectedNodeId ?? document.root.id
            event.preventDefault()
            event.stopPropagation()
            void attachImageToNode(image, targetId)
          }}
          onDragEnterCapture={(event) => {
            if (readOnly || presentationMode) return
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            const anchor = adapterRef.current?.resolveNode(event.target)
            setFileDropTargetId(anchor?.id ?? selectedNodeId ?? document.root.id)
          }}
          onDragOverCapture={(event) => {
            if (readOnly || presentationMode) return
            if (event.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = adapterRef.current?.resolveNode(event.target) ? 'copy' : 'none'; return }
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
            if (readOnly || presentationMode) return
            if (event.dataTransfer.types.includes(ANNOTATION_DRAG_TYPE)) {
              event.preventDefault(); event.stopPropagation()
              const target = adapterRef.current?.resolveNode(event.target)?.id
              if (target) linkToNode(event.dataTransfer.getData(ANNOTATION_DRAG_TYPE), target)
              else void knowledgeAction(async () => { throw new Error('请将批注拖到一个节点上，而不是空白画布。') }, '')
              return
            }
            if (!event.dataTransfer.files.length) return
            event.preventDefault()
            event.stopPropagation()
            const anchor = adapterRef.current?.resolveNode(event.target)
            const targetId = anchor?.id ?? fileDropTargetId ?? selectedNodeId ?? document.root.id
            setFileDropTargetId(undefined)
            void attachFiles(event.dataTransfer.files, targetId)
          }}
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest('[contenteditable], input, textarea, .me-epd')) return
            if ((event.target as HTMLElement).closest('[data-wiki-name]')) return
            const badge = (event.target as HTMLElement).closest<HTMLElement>('[data-source-node-id]')
            if (badge?.dataset.sourceNodeId) {
              event.preventDefault(); event.stopPropagation(); setSelectedNode(badge.dataset.sourceNodeId)
              const relation = annotationNodeRelations.find((item) => item.documentId === document.id && item.nodeId === badge.dataset.sourceNodeId)
              const annotation = paperAnnotations.find((item) => item.id === relation?.annotationId)
              if (annotation) openPaper(annotation.paperId, annotation.id, badge.dataset.sourceNodeId)
              return
            }
            if (event.shiftKey || useSelectionStore.getState().selectedNodeIds.length <= 1) return
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (!anchor) return
            // A normal click narrows a multi-selection to one topic. A drag does
            // not emit click, so group dragging still keeps every selected topic.
            setSelectedNode(anchor.id)
            adapterRef.current?.setSelections([anchor.id])
          }}
          onDoubleClickCapture={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.node-quick-actions, .canvas-controls, .me-epd, [data-source-node-id]')) return
            const editor = target.closest<HTMLElement>('#input-box[contenteditable]')
            const name = editor ? wikiLinkAtPoint(editor, event.clientX, event.clientY) : target.closest<HTMLElement>('[data-wiki-name]')?.dataset.wikiName
            if (name) {
              event.preventDefault(); event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              void openWikiLink(name)
              return
            }
            if (editor) return
            const anchor = adapterRef.current?.resolveNode(event.target)
            if (!anchor) return
            const paperRelation = !event.shiftKey && !event.ctrlKey && !event.metaKey
              ? nodePaperRelations.find((item) => item.documentId === document.id && item.nodeId === anchor.id && papers.some((paper) => paper.id === item.paperId))
              : undefined
            if (paperRelation) {
              event.preventDefault(); event.stopPropagation()
              const source = annotationNodeRelations.find((item) => item.documentId === document.id && item.nodeId === anchor.id)
              setSelectedNode(anchor.id)
              openPaper(paperRelation.paperId, source?.annotationId, anchor.id)
              return
            }
            if (readOnly || presentationMode) return
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
            const boxGesture = boxSelectionGestureRef.current
            if (boxGesture?.pointerId === event.pointerId && !boxGesture.moved) {
              const moved = Math.abs(event.clientX - boxGesture.x) > 4 || Math.abs(event.clientY - boxGesture.y) > 4
              if (moved) boxSelectionGestureRef.current = { ...boxGesture, moved: true }
            }
          }}
          onClick={(event) => {
            // Floating controls are not blank canvas: their own actions must
            // keep the selection (and a newly inserted child) intact.
            if ((event.target as HTMLElement).closest('.node-quick-actions, .canvas-controls, .me-epd')) return
            // Keep focus and the browser's text selection inside the inline editor.
            // Focusing the stage here would discard a drag-selected text range before
            // the user can delete it with Backspace.
            if ((event.target as HTMLElement).closest('#input-box[contenteditable]')) return
            const anchor = adapterRef.current?.resolveNode(event.target)
            const boxGesture = boxSelectionGestureRef.current
            boxSelectionGestureRef.current = undefined
            if (!anchor && boxGesture?.moved) {
              // Browsers emit a click after a completed marquee drag. That
              // synthetic blank-canvas click must not immediately clear the
              // group the marquee just selected.
              event.preventDefault()
              event.stopPropagation()
              return
            }
            if (relationSourceId && anchor) {
              event.preventDefault()
              event.stopPropagation()
              if (anchor.id !== relationSourceId) useDocumentStore.getState().addArrow(relationSourceId, anchor.id)
              setRelationSourceId(undefined)
              setSelectedNode(anchor.id)
              adapterRef.current?.select(anchor.id)
              return
            }
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
            <span>松开以插入“{findNode(document.root, fileDropTargetId)?.title ?? document.root.title}”：图片显示在主题中，PDF 生成子主题</span>
          </div>}
          {nodeAnchor && nodeAnchor.id === selectedNodeId && !readOnly && !presentationMode && <div className="node-quick-actions" style={{ left: nodeAnchor.left + nodeAnchor.width + 7, top: nodeAnchor.top + nodeAnchor.height / 2 }}>
            {nodeAnchor.hasChildren && <button className="node-mini-button collapse-button" aria-label={nodeAnchor.collapsed ? '展开下级' : '折叠下级'} onClick={() => {
              adapterRef.current?.toggleExpanded(nodeAnchor.id)
              setNodeAnchor({ ...nodeAnchor, collapsed: !nodeAnchor.collapsed })
            }}>{nodeAnchor.collapsed ? <Plus size={12} /> : <Minus size={12} />}</button>}
            {nodeAnchor.id === selectedNodeId && <button className="node-mini-button add-button" aria-label="添加子主题" onClick={() => command('child')}><Plus size={14} /></button>}
          </div>}
          {relationSourceId && <div className="relation-mode-hint"><Link2 size={15} />请选择另一个主题建立连接线 <button onClick={() => setRelationSourceId(undefined)}>取消</button></div>}
          {!fileDropTargetId && <button className="canvas-onboarding-tip" onClick={() => setHelpOpen(true)}><BookOpen size={15} /><span>{countNodes(document.root) === 1 ? '选中中心主题，按 Tab 添加第一个分支' : '双击编辑 · Shift 点击多选 · 空白处拖框选择 · 中键或空格+拖动平移'}</span><kbd>Ctrl /</kbd></button>}
          <div className="canvas-controls">
            <button onClick={() => adapterRef.current?.center()} title="居中" aria-label="居中"><Focus size={16} /></button>
            <button onClick={() => setCanvasScale(adapterRef.current?.fit() ?? 1)} title="适应画布" aria-label="适应画布"><Maximize2 size={16} /></button>
            <i />
            <button onClick={() => setCanvasScale(adapterRef.current?.zoomBy(-.1) ?? canvasScale)} disabled={canvasScale <= .4} title="缩小" aria-label="缩小"><ZoomOut size={16} /></button>
            <button className="canvas-scale" onClick={() => setCanvasScale(adapterRef.current?.actualSize() ?? 1)} title="恢复100%阅读大小">{Math.round(canvasScale * 100)}%</button>
            <button onClick={() => setCanvasScale(adapterRef.current?.zoomBy(.1) ?? canvasScale)} disabled={canvasScale >= 2} title="放大" aria-label="放大"><ZoomIn size={16} /></button>
            <i />
            <button onClick={() => useDocumentStore.getState().undo()} title="撤销（Ctrl + Z）" aria-label="撤销"><Undo2 size={16} /></button>
            <button onClick={() => useDocumentStore.getState().redo()} title="重做（Ctrl + Y）" aria-label="重做"><Redo2 size={16} /></button>
          </div>
        </main>}
      </NodeContextMenu>
      <MindMapTextToolbar key={`${id}-${editorView}`} hostRef={canvasRef} enabled={engineReady && editorView === 'mindmap' && !readOnly && !presentationMode} />
      {backlinksOpen && editorView === 'mindmap' && !presentationMode && <DocumentLinks document={document} documents={documents} onGoToNode={goToLinkedNode} overlay onClose={() => setBacklinksOpen(false)} />}
      {nameError && <div className="document-link-error" role="alert"><span>{nameError}</span><button aria-label="关闭名称提示" onClick={() => useDocumentStore.getState().clearNameError()}>×</button></div>}
      {ambiguousLink && <div className="wiki-choice-backdrop"><section className="wiki-choice" role="dialog" aria-modal="true" aria-label="选择同名文档"><header><strong>选择「{ambiguousLink}」对应的文档</strong><button className="icon-button" aria-label="关闭文档选择" onClick={() => setAmbiguousLink(undefined)}><X size={16} /></button></header><p>旧资料包含同名文档，请选择目标；可随后重命名以区分。</p>{matchingDocuments(documents, ambiguousLink).map((item) => <button key={item.id} onClick={() => void openWikiLink(ambiguousLink, item.id)}>{item.title}<small>{item.folderId ? useDocumentStore.getState().folders.find((folder) => folder.id === item.folderId)?.name : '未分类'} · {countNodes(item.root)} 个节点 · {new Date(item.updatedAt).toLocaleString()}</small></button>)}</section></div>}
      {editorView === 'mindmap' && selectedNodeId && !presentationMode && !readOnly && <div className="map-selection-toolbar" role="toolbar" aria-label="主题操作">
        <strong>{selectedNodeIds.length > 1 ? `已选 ${selectedNodeIds.length} 项` : selectedNode?.title || '当前主题'}</strong>
        {selectedNodeIds.length === 1 && <>
          <button onClick={() => command('sibling')} disabled={isRoot} title="Enter"><Plus size={14} />同级</button>
          <button onClick={() => command('child')} title="Tab"><Plus size={14} />下级</button>
           <button onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { taskStatus: selectedNode.taskStatus === 'none' ? 'todo' : 'none' })}><Check size={14} />待办</button>
          <button onClick={() => {
            setInspectorOpen(true)
            if (selectedNode) setDescriptionFocusRequest({ nodeId: selectedNode.id, nonce: Date.now() })
           }}><PanelRight size={14} />描述</button>
           <button onClick={() => imageInputRef.current?.click()}><ImagePlus size={14} />图片</button>
          <i />
          <button className={selectedNode?.style.fontWeight === '700' ? 'active' : ''} aria-label="主题加粗" title="加粗" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, fontWeight: selectedNode.style.fontWeight === '700' ? undefined : '700' } })}><Bold size={14} /></button>
          <button className={selectedNode?.style.fontStyle === 'italic' ? 'active' : ''} aria-label="主题斜体" title="斜体" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, fontStyle: selectedNode.style.fontStyle === 'italic' ? undefined : 'italic' } })}><Italic size={14} /></button>
          <button className={selectedNode?.style.textDecoration === 'underline' ? 'active' : ''} aria-label="主题下划线" title="下划线" onClick={() => selectedNode && useDocumentStore.getState().updateNode(selectedNode.id, { style: { ...selectedNode.style, textDecoration: selectedNode.style.textDecoration === 'underline' ? undefined : 'underline' } })}><Underline size={14} /></button>
          {!isRoot && <button className={relationSourceId ? 'active' : ''} onClick={() => { setRelationPickerOpen(false); setRelationSourceId(selectedNodeId) }}><Link2 size={14} />连接</button>}
        </>}
        {selectedNodeIds.length > 1 && <>
          <button onClick={() => useDocumentStore.getState().copyMany(selectedNodeIds)}><Copy size={14} />复制</button>
          <button className={movePickerOpen ? 'active' : ''} onClick={() => { setRelationPickerOpen(false); setMovePickerOpen((open) => !open) }}><MoveRight size={14} />移动到</button>
          <button onClick={() => updateSelected((node) => ({ taskStatus: node.taskStatus === 'none' ? 'todo' : 'none' }))}><CheckSquare size={14} />待办</button>
          <button onClick={() => updateSelected((node) => ({ taskStatus: node.taskStatus === 'done' ? 'todo' : 'done' }))}><Check size={14} />完成</button>
          <button disabled={!summaryAvailable} title={summaryAvailable ? '为相邻同级主题创建概要' : '概要要求选择相邻的同级主题'} onClick={() => useDocumentStore.getState().addSummary(selectedNodeIds)}><Braces size={14} />概要</button>
          <button disabled={selectedNodeIds.length !== 2} onClick={() => {
            if (selectedNodeIds.length === 2) useDocumentStore.getState().addArrow(selectedNodeIds[0], selectedNodeIds[1])
          }}><Link2 size={14} />连接</button>
        </>}
        {!isRoot && <button className="danger" aria-label={selectedNodeIds.length > 1 ? `删除已选 ${selectedNodeIds.length} 个主题` : '删除主题'} onClick={() => {
          if (selectedNodeIds.length > 1) useDocumentStore.getState().removeMany(selectedNodeIds)
          else command('remove')
          setSelectedNode(undefined)
        }}><Trash2 size={14} />删除</button>}
      </div>}
      {presentationMode && <button className="presentation-exit" onClick={() => setPresentationMode(false)}><X size={16} />退出演示</button>}
      {selectedNode && !presentationMode && <NodeSources key={selectedNode.id} documentId={document.id} nodeId={selectedNode.id} nodeTitle={selectedNode.title} onOpen={openPaper} onGoToNode={goToLinkedNode} readOnly={readOnly} />}
      {readingPaper && !presentationMode && <section className="map-paper-pane" aria-label="分栏论文阅读"><Suspense fallback={<div className="paper-reader-message">正在打开阅读区…</div>}><PaperReaderPage key={readingPaper.paperId} embedded readOnly={readOnly} paperId={readingPaper.paperId} annotationId={readingPaper.annotationId} locationKey={readingPaper.locationKey} documentId={document.id} nodeId={readingPaper.nodeId} autoCreateChildren onCreatedNode={(nodeId) => {
        setSelectedNode(nodeId)
        requestAnimationFrame(() => requestAnimationFrame(() => adapterRef.current?.reveal(nodeId)))
      }} onClose={() => setReadingPaper(undefined)} onGoToNode={goToLinkedNode} /></Suspense></section>}
      {inspectorOpen && !readingPaper && !readOnly && <><div className="inspector-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" onPointerDown={startInspectorResize} /><Suspense fallback={<aside className="node-inspector"><div className="inspector-empty">正在打开节点详情…</div></aside>}><NodeInspector key={selectedNode?.id ?? 'empty'} node={selectedNode} documentId={document.id} close={() => setInspectorOpen(false)} focusNoteRequest={descriptionFocusRequest} onOpenPaper={openPaper} onOpenWikiLink={(name) => void openWikiLink(name)} /></Suspense></>}
      <KnowledgeFeedback />
      <HistoryDialog document={document} open={historyOpen} onOpenChange={setHistoryOpen} />
      <ImportMarkdownDialog open={importOpen} onOpenChange={setImportOpen} onImport={importMarkdown} onImportFile={importStructuredFile} />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
