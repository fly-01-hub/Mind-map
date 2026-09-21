import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft, Check, ChevronRight, CircleAlert, CloudOff, Focus, History,
  FileDown, FileUp, ImageDown, Maximize2, Minus, MoreHorizontal, PanelRight,
  Plus, Redo2, Search, Undo2, X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MindMapEngineAdapter, type NodeAnchor } from '../../adapters/mindmap/MindMapEngineAdapter'
import { useDocumentStore } from '../../stores/documentStore'
import { useSaveStore } from '../../stores/saveStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useUiStore } from '../../stores/uiStore'
import { findNode, getBreadcrumbs } from '../../utils/tree'
import { NodeContextMenu, type NodeCommand } from './NodeContextMenu'
import { HistoryDialog, ImportMarkdownDialog } from './EditorDialogs'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import { documentRepository } from '../../repositories/documentRepository'
import { downloadText } from '../../services/export/download'
import { markdownToTree, treeToMarkdown } from '../../services/export/markdown'
import { searchDocuments } from '../../utils/search'
import 'mind-elixir/style.css'

const NodeInspector = lazy(() => import('../nodeInspector/NodeInspector').then((module) => ({ default: module.NodeInspector })))

const saveLabels = {
  saving: { label: '正在保存…', icon: <span className="sync-dot" /> },
  local: { label: '已保存到本地', icon: <Check size={14} /> },
  syncing: { label: '正在同步…', icon: <span className="sync-dot" /> },
  synced: { label: '已同步', icon: <Check size={14} /> },
  offline: { label: '离线', icon: <CloudOff size={14} /> },
  error: { label: '同步失败', icon: <CircleAlert size={14} /> },
}

export function MapEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MindMapEngineAdapter | undefined>(undefined)
  const composingRef = useRef(false)
  const pendingEditRef = useRef<string | undefined>(undefined)
  const [engineReady, setEngineReady] = useState(false)
  const [nodeAnchor, setNodeAnchor] = useState<NodeAnchor>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  const viewRoot = useMemo(() => document && (focusRootId ? findNode(document.root, focusRootId) : document.root), [document, focusRootId])
  const selectedNode = document && selectedNodeId ? findNode(document.root, selectedNodeId) : undefined
  const breadcrumbs = document && focusRootId ? getBreadcrumbs(document.root, focusRootId) : []
  const searchResults = useMemo(() => document ? searchDocuments([document], searchQuery) : [], [document, searchQuery])

  useEffect(() => {
    if (id) openDocument(id)
    return () => setFocusRoot(undefined)
  }, [id, openDocument, setFocusRoot])

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

  const attachFiles = async (files: FileList, nodeId: string) => {
    if (!document) return
    const target = findNode(useDocumentStore.getState().documents.find((item) => item.id === document.id)?.root ?? document.root, nodeId)
    if (!target) return
    const attachments = []
    for (const file of Array.from(files)) attachments.push(await attachmentRepository.save(document.id, nodeId, file))
    useDocumentStore.getState().updateNode(nodeId, { attachments: [...target.attachments, ...attachments] })
    setSelectedNode(nodeId)
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
    if (mod && event.key === ']') { event.preventDefault(); command('focus'); return }
    if (mod && event.shiftKey && event.key === '.') { event.preventDefault(); command('toggleSiblings'); return }
    if (event.altKey && event.key === '.') { event.preventDefault(); command('toggle'); return }
    if (event.key === 'Enter') { event.preventDefault(); command('sibling'); return }
    if (event.key === 'Tab') { event.preventDefault(); if (event.shiftKey) command('promote'); else command('child'); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); command('remove'); return }
    if (event.key === 'Escape') { adapterRef.current?.clearSelection(); setSelectedNode(undefined); setSearchOpen(false) }
  }

  if (!document || !viewRoot) return <main className="not-found"><strong>没有找到这份文档</strong><Link to="/library">返回知识库</Link></main>

  const activeSave = saveLabels[saveStatus]
  const isRoot = selectedNodeId === document.root.id

  return (
    <div className={`editor-shell ${inspectorOpen ? 'with-inspector' : ''}`}>
      <header className="editor-toolbar">
        <button className="icon-button" onClick={() => navigate('/library')} aria-label="返回知识库"><ArrowLeft size={19} /></button>
        <div className="toolbar-divider" />
        <input className="document-title-input" value={document.title} aria-label="文档名称" onChange={(event) => renameDocument(document.id, event.target.value)} />
        <div className={`save-status status-${saveStatus}`}>{activeSave.icon}<span>{activeSave.label}</span></div>
        <div className="toolbar-spacer" />
        <button className="icon-button" onClick={() => setSearchOpen(!searchOpen)} aria-label="搜索"><Search size={18} /></button>
        <button className="icon-button" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="节点详情"><PanelRight size={18} /></button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><button className="icon-button" aria-label="更多"><MoreHorizontal size={19} /></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end">
            <DropdownMenu.Label className="dropdown-label">导入与导出</DropdownMenu.Label>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => setImportOpen(true)}><FileUp size={16} />导入 Markdown</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={() => downloadText(treeToMarkdown(document.root), `${document.title}.md`, 'text/markdown;charset=utf-8')}><FileDown size={16} />导出 Markdown</DropdownMenu.Item>
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
          className="mindmap-stage"
          tabIndex={0}
          onPointerDownCapture={(event) => {
            if (!(event.target as HTMLElement).isContentEditable) event.currentTarget.focus({ preventScroll: true })
          }}
          onKeyDownCapture={handleKeyDown}
          onCompositionStartCapture={() => { composingRef.current = true }}
          onCompositionEndCapture={() => { composingRef.current = false }}
          onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return
            event.preventDefault()
            const anchor = adapterRef.current?.resolveNode(event.target)
            const targetId = anchor?.id ?? selectedNodeId
            if (targetId) void attachFiles(event.dataTransfer.files, targetId)
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
          {nodeAnchor && <div className="node-quick-actions" style={{ left: nodeAnchor.left + nodeAnchor.width + 7, top: nodeAnchor.top + nodeAnchor.height / 2 }}>
            {nodeAnchor.hasChildren && <button className="node-mini-button collapse-button" aria-label={nodeAnchor.collapsed ? '展开下级' : '折叠下级'} onClick={() => {
              adapterRef.current?.toggleExpanded(nodeAnchor.id)
              setNodeAnchor({ ...nodeAnchor, collapsed: !nodeAnchor.collapsed })
            }}>{nodeAnchor.collapsed ? <Plus size={12} /> : <Minus size={12} />}</button>}
            {nodeAnchor.id === selectedNodeId && <button className="node-mini-button add-button" aria-label="添加子主题" onClick={() => command('child')}><Plus size={14} /></button>}
          </div>}
          <div className="canvas-controls"><button onClick={() => adapterRef.current?.center()} title="居中"><Focus size={16} /></button><button onClick={() => adapterRef.current?.fit()} title="适应画布"><Maximize2 size={16} /></button><span /><button onClick={() => useDocumentStore.getState().undo()} title="撤销"><Undo2 size={16} /></button><button onClick={() => useDocumentStore.getState().redo()} title="重做"><Redo2 size={16} /></button></div>
        </main>
      </NodeContextMenu>
      {inspectorOpen && <Suspense fallback={<aside className="node-inspector"><div className="inspector-empty">正在打开节点详情…</div></aside>}><NodeInspector key={selectedNode?.id ?? 'empty'} node={selectedNode} documentId={document.id} close={() => setInspectorOpen(false)} /></Suspense>}
      <HistoryDialog document={document} open={historyOpen} onOpenChange={setHistoryOpen} />
      <ImportMarkdownDialog open={importOpen} onOpenChange={setImportOpen} onImport={importMarkdown} />
    </div>
  )
}
