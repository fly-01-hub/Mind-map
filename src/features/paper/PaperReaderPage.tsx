import {
  ArrowLeft, ChevronLeft, ChevronRight, Minus, PanelRightClose, PanelRightOpen, Plus, RotateCcw, Search, X, Scan, Maximize2, Highlighter,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { paperRepository } from '../../repositories/paperRepository'
import { loadPdfDocument, searchPdfDocument, type PdfSearchResult } from '../../services/pdf/pdfParser'
import { paperFileService } from '../../services/pdf/paperFileService'
import { usePaperStore } from '../../stores/paperStore'
import { useUserStore } from '../../stores/userStore'
import { useDocumentStore } from '../../stores/documentStore'
import { findNode } from '../../utils/tree'
import type { AnnotationColor, PaperAnnotation, PaperAnnotationType, PdfTextSelection } from '../../types/annotation'
import { AnnotationToolbar } from './AnnotationToolbar'
import { CreateNodeFromAnnotationDialog } from './CreateNodeFromAnnotationDialog'
import { paperKnowledgeService } from '../../services/paper/paperKnowledgeService'
import { PdfViewer } from './PdfViewer'
import { PaperSidebar } from './PaperSidebar'
import { LinkAnnotationDialog } from './LinkAnnotationDialog'
import { KnowledgeFeedback } from './knowledgeFeedback'
import { knowledgeAction, useKnowledgeFeedbackStore } from '../../stores/knowledgeFeedbackStore'
import './paper-reader.css'

const clampScale = (scale: number) => Math.min(2.5, Math.max(.5, Math.round(scale * 10) / 10))

interface PaperReaderProps {
  paperId?: string; annotationId?: string; documentId?: string; nodeId?: string; locationKey?: number
  embedded?: boolean; readOnly?: boolean; onClose?: () => void; onGoToNode?: (documentId: string, nodeId: string) => void
  autoCreateChildren?: boolean
  onCreatedNode?: (nodeId: string) => void
}
export function PaperReaderPage(props: PaperReaderProps = {}) {
  const params = useParams()
  const paperId = props.paperId ?? params.paperId
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const papers = usePaperStore((state) => state.papers)
  const refreshPapers = usePaperStore((state) => state.refresh)
  const paper = papers.find((item) => item.id === paperId)
  const requestedPageParam = props.embedded ? null : searchParams.get('page')
  const requestedAnnotationId = props.annotationId ?? (props.embedded ? undefined : searchParams.get('annotationId') ?? undefined)
  const contextDocumentId = props.documentId ?? searchParams.get('documentId') ?? undefined
  const contextNodeId = props.nodeId ?? searchParams.get('nodeId') ?? undefined
  const maps = useDocumentStore((state) => state.documents)
  const contextMap = maps.find((map) => map.id === contextDocumentId && !map.deletedAt)
  const contextNode = contextMap && contextNodeId ? findNode(contextMap.root, contextNodeId) : undefined
  const readerRef = useRef<HTMLElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const fittedDocumentRef = useRef<PDFDocumentProxy | undefined>(undefined)
  const [areaMode, setAreaMode] = useState(false)
  const [areaStyle, setAreaStyle] = useState<'highlight' | 'outline'>('outline')
  const [selectionMode, setSelectionMode] = useState<'manual' | 'highlight' | 'underline'>('manual')
  const selectionSavingRef = useRef(false)
  const [editingAreaId, setEditingAreaId] = useState<string>()
  const [linkingAnnotationIds, setLinkingAnnotationIds] = useState<string[]>()
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(!props.embedded)
  const [searchDraft, setSearchDraft] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([])
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchError, setSearchError] = useState('')
  const [textSelection, setTextSelection] = useState<PdfTextSelection>()
  const [activeAnnotationId, setActiveAnnotationId] = useState(requestedAnnotationId)
  const [generationSource, setGenerationSource] = useState<{ annotation: PaperAnnotation; isNew: boolean }>()
  const [createdNodeTitle, setCreatedNodeTitle] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchRunRef = useRef(0)
  const userId = useUserStore((state) => state.id) ?? 'local-demo-user'
  const allAnnotations = usePaperStore((state) => state.annotations)
  const createAnnotation = usePaperStore((state) => state.createAnnotation)
  const updateAnnotationContent = usePaperStore((state) => state.updateAnnotationContent)
  const deleteAnnotation = usePaperStore((state) => state.deleteAnnotation)
  const annotations = useMemo(() => allAnnotations.filter((annotation) => annotation.paperId === paperId)
    .sort((a, b) => a.pageNumber - b.pageNumber || a.createdAt.localeCompare(b.createdAt)), [allAnnotations, paperId])
  const pageAnnotations = useMemo(() => annotations.filter((annotation) => annotation.pageNumber === pageNumber), [annotations, pageNumber])
  const totalMatches = useMemo(() => searchResults.reduce((sum, result) => sum + result.occurrences, 0), [searchResults])

  const goToPage = useCallback((value: number) => {
    setTextSelection(undefined)
    setActiveAnnotationId(undefined)
    setAreaMode(false)
    setEditingAreaId(undefined)
    window.getSelection()?.removeAllRanges()
    setPageNumber(Math.min(document?.numPages ?? 1, Math.max(1, value)))
  }, [document?.numPages])

  const changeScale = useCallback((delta: number) => {
    setTextSelection(undefined)
    setAreaMode(false)
    setEditingAreaId(undefined)
    window.getSelection()?.removeAllRanges()
    setScale((value) => clampScale(value + delta))
  }, [])

  const fitWidth = useCallback(async () => {
    if (!document || !workspaceRef.current) return
    const page = await document.getPage(pageNumber)
    const width = page.getViewport({ scale: 1 }).width
    const available = workspaceRef.current.clientWidth - 48
    setScale(Math.min(2.5, Math.max(.5, Math.floor(available / width * 100) / 100)))
    setTextSelection(undefined); setAreaMode(false)
    setEditingAreaId(undefined)
  }, [document, pageNumber])
  useEffect(() => {
    if (!props.embedded || loading || !document || fittedDocumentRef.current === document) return
    fittedDocumentRef.current = document
    void fitWidth().catch(() => {})
  }, [document, loading, props.embedded, fitWidth])

  useEffect(() => {
    const currentPaper = usePaperStore.getState().papers.find((item) => item.id === paperId)
    if (!currentPaper) return
    let disposed = false
    let loadedDocument: PDFDocumentProxy | undefined
    let destroyDocument: (() => Promise<void>) | undefined
    const load = async () => {
      try {
        setLoading(true); setError(''); setDocument(undefined)
        const [blob, readingState] = await Promise.all([
          paperFileService.load(currentPaper),
          paperRepository.getReadingState(currentPaper.id),
        ])
        const loaded = await loadPdfDocument(blob)
        loadedDocument = loaded.document
        destroyDocument = loaded.destroy
        if (disposed) { await destroyDocument(); return }
        setDocument(loadedDocument)
        const requestedPage = Number(requestedPageParam)
        const requestedAnnotationPage = requestedAnnotationId
          ? usePaperStore.getState().annotations.find((annotation) => annotation.id === requestedAnnotationId)?.pageNumber
          : undefined
        const restoredPage = Number.isInteger(requestedPage) && requestedPage > 0
          ? requestedPage
          : requestedAnnotationPage ?? readingState?.pageNumber ?? 1
        setPageNumber(Math.min(loadedDocument.numPages, Math.max(1, restoredPage)))
        setScale(clampScale(readingState?.scale ?? 1.2))
        if (currentPaper.pageCount !== loadedDocument.numPages) {
          await paperRepository.updatePageCount(currentPaper.id, loadedDocument.numPages)
          await refreshPapers()
        }
        setLoading(false)
      } catch (reason) {
        if (disposed) return
        setLoading(false)
        setError(reason instanceof Error ? reason.message : '无法打开这篇论文。')
      }
    }
    void load()
    return () => {
      disposed = true
      searchRunRef.current += 1
      if (loadedDocument) void destroyDocument?.().catch(() => {})
    }
  // A new location in the same PDF must not destroy and reload the document.
  // The location effect below handles it after loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, refreshPapers, reloadKey])

  useEffect(() => {
    if (!document) return
    const annotation = requestedAnnotationId ? usePaperStore.getState().annotations.find((item) => item.id === requestedAnnotationId && item.paperId === paperId) : undefined
    const requestedPage = annotation?.pageNumber ?? Number(requestedPageParam)
    if (requestedPage > 0) {
      setPageNumber(Math.min(document.numPages, Math.max(1, requestedPage)))
      setActiveAnnotationId(annotation?.id)
      setTextSelection(undefined)
    }
  }, [document, paperId, requestedAnnotationId, requestedPageParam, props.locationKey])

  useEffect(() => {
    if (!paper || !document) return
    // Persist discrete page/zoom changes immediately: leaving the reader or
    // opening Android's file picker must not cancel the latest reading state.
    void paperRepository.saveReadingState(paper.id, pageNumber, scale).catch(() => {
      useKnowledgeFeedbackStore.setState({ message: '阅读进度保存失败，请重试并检查设备剩余空间。', error: true })
    })
  }, [document, pageNumber, paper, scale])

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [searchOpen])

  const runSearch = useCallback(async () => {
    if (!document || !searchDraft.trim()) return
    const run = searchRunRef.current + 1
    searchRunRef.current = run
    setSearching(true)
    setSearchProgress(0)
    setSearchError('')
    try {
      const results = await searchPdfDocument(document, searchDraft, (completed) => {
      if (searchRunRef.current === run) setSearchProgress(completed)
    })
    if (searchRunRef.current !== run) return
    setSearchResults(results)
    setSearchResultIndex(0)
    setActiveSearch(searchDraft.trim())
    if (results[0]) goToPage(results[0].pageNumber)
    setSearching(false)
    } catch (reason) {
      if (searchRunRef.current !== run) return
      setSearching(false); setSearchError(reason instanceof Error ? reason.message : '搜索失败，请重试。')
    }
  }, [document, goToPage, searchDraft])

  const moveSearchResult = useCallback((direction: number) => {
    if (!searchResults.length) return
    const next = (searchResultIndex + direction + searchResults.length) % searchResults.length
    setSearchResultIndex(next)
    goToPage(searchResults[next].pageNumber)
  }, [goToPage, searchResultIndex, searchResults])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (props.embedded && !readerRef.current?.contains(target)) return
      if (target.closest('[role="dialog"]')) return
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
        event.preventDefault()
        changeScale(.1)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault()
        changeScale(-.1)
        return
      }
      if (event.key === 'Escape') { setSearchOpen(false); setAreaMode(false); setEditingAreaId(undefined); setTextSelection(undefined); window.getSelection()?.removeAllRanges(); return }
      if (editing) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') goToPage(pageNumber + 1)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') goToPage(pageNumber - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeScale, goToPage, pageNumber, props.embedded])

  const saveSelection = async (annotationType: PaperAnnotationType, content = '', color: AnnotationColor = 'yellow', selection = textSelection) => {
    if (!paper || !selection || selectionSavingRef.current || props.readOnly) return
    selectionSavingRef.current = true
    try {
    const input = {
      paperId: paper.id, userId, annotationType, content, color, previewImage: selection.previewImage, areaStyle: selection.areaStyle,
      pageNumber: selection.pageNumber, selectedText: selection.selectedText,
      positionData: selection.positionData,
    }
    let annotation: PaperAnnotation
    if (editingAreaId && selection.kind === 'area' && selection.previewImage) {
      annotation = await usePaperStore.getState().updateArea(editingAreaId, selection.positionData, selection.previewImage, color)
    } else if (props.autoCreateChildren && contextMap && contextNode) {
      const timestamp = new Date().toISOString()
      const result = await paperKnowledgeService.createNode({
        paper, annotation: { ...input, id: `pending-${crypto.randomUUID()}`, createdAt: timestamp, updatedAt: timestamp },
        documentId: contextMap.id, parentNodeId: contextNode.id,
        title: selection.selectedText, note: content, userId,
      })
      annotation = usePaperStore.getState().annotations.find((item) => item.id === result.annotationRelation.annotationId)!
      setCreatedNodeTitle(result.node.title)
      props.onCreatedNode?.(result.node.id)
    } else {
      // Never silently put an annotation under a different selected node.
      if (props.autoCreateChildren && contextNodeId) throw new Error('文献节点已被删除。请关闭分栏并重新打开文献。')
      annotation = await createAnnotation(input)
    }
    setTextSelection(undefined)
    window.getSelection()?.removeAllRanges()
    setAreaMode(false); setEditingAreaId(undefined); setSidebarOpen(!props.embedded); setActiveAnnotationId(annotation.id)
    return annotation
    } finally { selectionSavingRef.current = false }
  }
  const saveAnnotation = async (annotationType: PaperAnnotationType, content = '', color?: AnnotationColor) => { await saveSelection(annotationType, content, color) }

  const generateFromSelection = (color: AnnotationColor = 'yellow') => {
    if (!paper || !textSelection) return
    const timestamp = new Date().toISOString()
    setGenerationSource({
      isNew: true,
      annotation: {
        id: `pending-${crypto.randomUUID()}`, paperId: paper.id, userId, color,
        annotationType: textSelection.kind === 'area' ? 'area' : 'highlight', areaStyle: textSelection.areaStyle, previewImage: textSelection.previewImage, pageNumber: textSelection.pageNumber,
        content: '', selectedText: textSelection.selectedText,
        positionData: textSelection.positionData, createdAt: timestamp, updatedAt: timestamp,
      },
    })
  }

  const confirmNodeGeneration = async (value: { documentId: string; parentNodeId: string; title: string; note: string }) => {
    if (!paper || !generationSource) return
    const annotation = generationSource.annotation
    await paperKnowledgeService.createNode({
      paper, annotation, documentId: value.documentId, parentNodeId: value.parentNodeId,
      title: value.title, note: value.note, userId,
    })
    setCreatedNodeTitle(value.title)
    setGenerationSource(undefined)
    setTextSelection(undefined)
    window.getSelection()?.removeAllRanges()
    setAreaMode(false)
  }

  const leaveReader = () => {
    if (props.onClose) { props.onClose(); return }
    const documentId = searchParams.get('documentId')
    navigate(documentId ? `/map/${documentId}` : '/library')
  }

  if (!paper) return <main className="paper-reader-message"><h1>找不到论文</h1><p>它可能已被删除，或恢复备份时没有包含这篇论文。</p><button onClick={leaveReader}>{props.embedded ? '关闭阅读' : '返回文档库'}</button></main>
  if (loading) return <main className="paper-reader-message"><span className="reader-spinner" /><h1>正在打开论文</h1><p>正在从本地资料库读取 PDF。</p>{props.embedded && <button onClick={leaveReader}>关闭阅读</button>}</main>
  if (error || !document) return <main className="paper-reader-message"><h1>无法打开论文</h1><p>{error}</p><div><button onClick={leaveReader}>返回</button><button onClick={() => { setLoading(true); setError(''); setDocument(undefined); setReloadKey((value) => value + 1) }}><RotateCcw size={14} />重试</button></div></main>

  return (
    <main ref={readerRef} tabIndex={-1} className={`paper-reader-page ${props.embedded ? 'embedded-reader' : ''} ${sidebarOpen ? 'paper-sidebar-open' : 'paper-sidebar-hidden'} ${searchOpen ? 'paper-search-open' : ''}`} onPointerDown={() => {
      if (props.embedded && !readerRef.current?.contains(window.document.activeElement)) readerRef.current?.focus({ preventScroll: true })
    }}>
      <header className="paper-reader-toolbar">
        <button className="paper-tool-button" onClick={leaveReader} aria-label="返回思维导图" title="返回思维导图"><ArrowLeft size={17} /></button>
        <div className="paper-reader-title"><span>论文阅读</span><strong>{paper.title}</strong></div>
        <div className="paper-page-controls">
          <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="上一页"><ChevronLeft size={16} /></button>
          <input aria-label="当前页码" type="number" min={1} max={document.numPages} value={pageNumber} onChange={(event) => goToPage(Number(event.target.value))} />
          <span>/ {document.numPages}</span>
          <button onClick={() => goToPage(pageNumber + 1)} disabled={pageNumber >= document.numPages} aria-label="下一页"><ChevronRight size={16} /></button>
        </div>
        <div className="paper-zoom-controls">
          <button onClick={() => changeScale(-.1)} disabled={scale <= .5} aria-label="缩小"><Minus size={15} /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => changeScale(.1)} disabled={scale >= 2.5} aria-label="放大"><Plus size={15} /></button>
          <button onClick={() => void knowledgeAction(fitWidth, '已适应阅读区宽度')} aria-label="适应阅读宽度" title="适应阅读区宽度"><Maximize2 size={14} /></button>
        </div>
        <button className={`paper-search-toggle ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen((value) => !value)} title="搜索论文文字（Ctrl + F）"><Search size={15} />搜索</button>
        <button disabled={props.readOnly} aria-pressed={areaMode && areaStyle === 'highlight'} className={`paper-search-toggle ${areaMode && areaStyle === 'highlight' ? 'active' : ''}`} onClick={() => { setAreaMode(!(areaMode && areaStyle === 'highlight')); setAreaStyle('highlight'); setEditingAreaId(undefined); setTextSelection(undefined); window.getSelection()?.removeAllRanges() }} aria-label="矩形高亮" title="用鼠标框选任意矩形区域，整块高亮"><Highlighter size={15} />矩形高亮</button>
        <button disabled={props.readOnly} className={`paper-tool-button ${areaMode && areaStyle === 'outline' ? 'active' : ''}`} onClick={() => { setAreaMode(!(areaMode && areaStyle === 'outline')); setAreaStyle('outline'); setEditingAreaId(undefined); setTextSelection(undefined); window.getSelection()?.removeAllRanges() }} aria-label="区域批注" title="拖框摘取图片、表格或公式"><Scan size={16} /></button>
        <select className="paper-selection-mode" aria-label="划选标注模式" disabled={props.readOnly} value={selectionMode} onChange={(event) => { setSelectionMode(event.target.value as typeof selectionMode); setTextSelection(undefined); window.getSelection()?.removeAllRanges() }}>
          <option value="manual">划选后选择标注</option><option value="highlight">划选即高亮</option><option value="underline">划选即下划线</option>
        </select>
        <button className={`paper-tool-button paper-sidebar-toggle ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? '收起论文笔记' : '展开论文笔记'} title={sidebarOpen ? '收起论文笔记' : '展开论文笔记'}>{sidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>
        <span className="paper-reading-progress" style={{ width: `${pageNumber / document.numPages * 100}%` }} aria-hidden="true" />
      </header>
      {searchOpen && <div className="paper-search-bar">
        <Search size={15} />
        <input ref={searchInputRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }} placeholder="搜索论文文字…" />
        <span>{searching ? `${searchProgress}/${document.numPages}` : activeSearch ? `${totalMatches} 处` : 'Ctrl + F'}</span>
        <button onClick={() => moveSearchResult(-1)} disabled={!searchResults.length} aria-label="上一个搜索结果"><ChevronLeft size={14} /></button>
        <button onClick={() => moveSearchResult(1)} disabled={!searchResults.length} aria-label="下一个搜索结果"><ChevronRight size={14} /></button>
        <button onClick={() => setSearchOpen(false)} aria-label="关闭搜索"><X size={14} /></button>
      </div>}
      {searchError && searchOpen && <div className="paper-search-error" role="alert">{searchError}</div>}
      <div className="paper-reader-content">
        <section ref={workspaceRef} className="pdf-workspace" onScroll={() => setTextSelection(undefined)}>
          {areaMode && <div className="area-mode-hint">{editingAreaId ? '重新框选，原有笔记与节点关联保持不变' : areaStyle === 'highlight' ? '拖出矩形 → 选择颜色 → 保存区域高亮（扫描件也可用）' : '拖动框选图表或公式'} · Esc 退出</div>}
          <PdfViewer document={document} pageNumber={pageNumber} scale={scale} searchQuery={activeSearch} annotations={pageAnnotations} activeAnnotationId={activeAnnotationId} onTextSelection={(selection) => {
            setTextSelection(selection)
            if (selection && !props.readOnly && selection.kind !== 'area' && selectionMode !== 'manual') {
              void knowledgeAction(() => saveSelection(selectionMode, '', 'yellow', selection), props.autoCreateChildren && contextNode ? '已标注并生成文献子节点' : '已标注')
            }
          }} areaMode={areaMode} areaStyle={areaStyle} onAnnotationActivate={(annotation) => { setActiveAnnotationId(annotation.id); setSidebarOpen(true) }} />
        </section>
        <PaperSidebar
          onEditArea={(annotation) => { goToPage(annotation.pageNumber); setEditingAreaId(annotation.id); setAreaStyle(annotation.areaStyle ?? 'outline'); setAreaMode(true); setSidebarOpen(false) }}
          readOnly={props.readOnly} currentNodeTitle={contextNode?.title} onQuickLink={contextNode && !props.readOnly ? (annotation) => {
            let added: string[] = []
            void knowledgeAction(async () => { added = await paperKnowledgeService.linkAnnotations([annotation.id], contextMap!.id, [contextNode.id]) }, `已关联到“${contextNode.title}”`, () => paperKnowledgeService.unlinkRelations(added))
          } : undefined}
          paper={{ ...paper, pageCount: document.numPages }} pageNumber={pageNumber} annotations={annotations} activeAnnotationId={activeAnnotationId}
          onGoToAnnotation={(annotation) => { goToPage(annotation.pageNumber); setActiveAnnotationId(annotation.id) }}
          onUpdateAnnotation={(annotation, content) => void updateAnnotationContent(annotation.id, content, userId)}
          onDeleteAnnotation={(annotation) => void deleteAnnotation(annotation.id, userId)}
          onGenerateNode={(annotation) => setGenerationSource({ annotation, isNew: false })}
          onLinkAnnotation={(annotation) => setLinkingAnnotationIds([annotation.id])}
          onGoToNode={(documentId, nodeId) => props.onGoToNode ? props.onGoToNode(documentId, nodeId) : navigate(`/map/${documentId}?nodeId=${encodeURIComponent(nodeId)}`)}
        />
      </div>
      {createdNodeTitle && <div className="paper-node-created">已创建节点“{createdNodeTitle}”<button onClick={() => setCreatedNodeTitle('')}>×</button></div>}
      {textSelection && !generationSource && !props.readOnly && <AnnotationToolbar editingArea={Boolean(editingAreaId)} defaultColor={annotations.find((annotation) => annotation.id === editingAreaId)?.color} key={`${textSelection.pageNumber}-${textSelection.anchor.left}-${textSelection.anchor.top}`} selection={textSelection} onCreate={saveAnnotation} onGenerate={generateFromSelection} onLink={(color) => void knowledgeAction(async () => {
        const annotation = await saveSelection(textSelection.kind === 'area' ? 'area' : 'highlight', '', color)
        if (annotation) setLinkingAnnotationIds([annotation.id])
      }, '批注已保存，请选择目标节点')} onClose={() => { setTextSelection(undefined); setEditingAreaId(undefined); setAreaMode(false); window.getSelection()?.removeAllRanges() }} />}
      {generationSource && <CreateNodeFromAnnotationDialog
        key={generationSource.annotation.id} paper={paper} annotation={generationSource.annotation}
        defaultDocumentId={contextDocumentId} defaultNodeId={contextNodeId}
        onClose={() => setGenerationSource(undefined)} onConfirm={confirmNodeGeneration}
      />}
      {linkingAnnotationIds && <LinkAnnotationDialog annotationIds={linkingAnnotationIds} defaultDocumentId={contextDocumentId} defaultNodeId={contextNodeId} onClose={() => setLinkingAnnotationIds(undefined)} />}
      {!props.embedded && <KnowledgeFeedback />}
    </main>
  )
}
