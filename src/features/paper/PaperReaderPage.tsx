import {
  ArrowLeft, ChevronLeft, ChevronRight, Minus, PanelRightClose, PanelRightOpen, Plus, RotateCcw, Search, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { paperRepository } from '../../repositories/paperRepository'
import { loadPdfDocument, searchPdfDocument, type PdfSearchResult } from '../../services/pdf/pdfParser'
import { paperFileService } from '../../services/pdf/paperFileService'
import { usePaperStore } from '../../stores/paperStore'
import { useUserStore } from '../../stores/userStore'
import type { PaperAnnotation, PaperAnnotationType, PdfTextSelection } from '../../types/annotation'
import { AnnotationToolbar } from './AnnotationToolbar'
import { CreateNodeFromAnnotationDialog } from './CreateNodeFromAnnotationDialog'
import { paperKnowledgeService } from '../../services/paper/paperKnowledgeService'
import { PdfViewer } from './PdfViewer'
import { PaperSidebar } from './PaperSidebar'
import './paper-reader.css'

const clampScale = (scale: number) => Math.min(2.5, Math.max(.5, Math.round(scale * 10) / 10))

export function PaperReaderPage() {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const papers = usePaperStore((state) => state.papers)
  const refreshPapers = usePaperStore((state) => state.refresh)
  const paper = papers.find((item) => item.id === paperId)
  const requestedPageParam = searchParams.get('page')
  const requestedAnnotationId = searchParams.get('annotationId') ?? undefined
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchDraft, setSearchDraft] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([])
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
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
    window.getSelection()?.removeAllRanges()
    setPageNumber(Math.min(document?.numPages ?? 1, Math.max(1, value)))
  }, [document?.numPages])

  const changeScale = useCallback((delta: number) => {
    setTextSelection(undefined)
    window.getSelection()?.removeAllRanges()
    setScale((value) => clampScale(value + delta))
  }, [])

  useEffect(() => {
    const currentPaper = usePaperStore.getState().papers.find((item) => item.id === paperId)
    if (!currentPaper) return
    let disposed = false
    let loadedDocument: PDFDocumentProxy | undefined
    let destroyDocument: (() => Promise<void>) | undefined
    const load = async () => {
      try {
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
      if (loadedDocument) void destroyDocument?.()
    }
  }, [paperId, refreshPapers, reloadKey, requestedAnnotationId, requestedPageParam])

  useEffect(() => {
    if (!paper || !document) return
    const timer = window.setTimeout(() => {
      void paperRepository.saveReadingState(paper.id, pageNumber, scale)
    }, 250)
    return () => window.clearTimeout(timer)
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
    const results = await searchPdfDocument(document, searchDraft, (completed) => {
      if (searchRunRef.current === run) setSearchProgress(completed)
    })
    if (searchRunRef.current !== run) return
    setSearchResults(results)
    setSearchResultIndex(0)
    setActiveSearch(searchDraft.trim())
    if (results[0]) goToPage(results[0].pageNumber)
    setSearching(false)
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
      if (event.key === 'Escape') { setSearchOpen(false); setTextSelection(undefined); window.getSelection()?.removeAllRanges(); return }
      if (editing) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') goToPage(pageNumber + 1)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') goToPage(pageNumber - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeScale, goToPage, pageNumber])

  const saveAnnotation = async (annotationType: PaperAnnotationType, content = '') => {
    if (!paper || !textSelection) return
    await createAnnotation({
      paperId: paper.id, userId, annotationType, content,
      pageNumber: textSelection.pageNumber, selectedText: textSelection.selectedText,
      positionData: textSelection.positionData,
    })
    setTextSelection(undefined)
    window.getSelection()?.removeAllRanges()
  }

  const generateFromSelection = () => {
    if (!paper || !textSelection) return
    const timestamp = new Date().toISOString()
    setGenerationSource({
      isNew: true,
      annotation: {
        id: `pending-${crypto.randomUUID()}`, paperId: paper.id, userId,
        annotationType: 'highlight', pageNumber: textSelection.pageNumber,
        content: '', selectedText: textSelection.selectedText,
        positionData: textSelection.positionData, createdAt: timestamp, updatedAt: timestamp,
      },
    })
  }

  const confirmNodeGeneration = async (value: { documentId: string; parentNodeId: string; title: string; note: string }) => {
    if (!paper || !generationSource) return
    let annotation = generationSource.annotation
    if (generationSource.isNew) {
      annotation = await createAnnotation({
        paperId: paper.id, userId, annotationType: 'highlight', pageNumber: annotation.pageNumber,
        content: value.note, selectedText: annotation.selectedText, positionData: annotation.positionData,
      })
    }
    await paperKnowledgeService.createNode({
      paper, annotation, documentId: value.documentId, parentNodeId: value.parentNodeId,
      title: value.title, note: value.note, userId,
    })
    setCreatedNodeTitle(value.title)
    setGenerationSource(undefined)
    setTextSelection(undefined)
    window.getSelection()?.removeAllRanges()
  }

  const leaveReader = () => {
    const documentId = searchParams.get('documentId')
    navigate(documentId ? `/map/${documentId}` : '/library')
  }

  if (!paper) return <main className="paper-reader-message"><h1>找不到论文</h1><p>它可能已被删除，或恢复备份时没有包含这篇论文。</p><button onClick={() => navigate('/library')}>返回文档库</button></main>
  if (loading) return <main className="paper-reader-message"><span className="reader-spinner" /><h1>正在打开论文</h1><p>正在从本地资料库读取 PDF。</p></main>
  if (error || !document) return <main className="paper-reader-message"><h1>无法打开论文</h1><p>{error}</p><div><button onClick={leaveReader}>返回</button><button onClick={() => { setLoading(true); setError(''); setDocument(undefined); setReloadKey((value) => value + 1) }}><RotateCcw size={14} />重试</button></div></main>

  return (
    <main className={`paper-reader-page ${sidebarOpen ? 'paper-sidebar-open' : 'paper-sidebar-hidden'} ${searchOpen ? 'paper-search-open' : ''}`}>
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
        </div>
        <button className={`paper-search-toggle ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen((value) => !value)} title="搜索论文文字（Ctrl + F）"><Search size={15} />搜索</button>
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
      <div className="paper-reader-content">
        <section className="pdf-workspace" onScroll={() => setTextSelection(undefined)}>
          <PdfViewer document={document} pageNumber={pageNumber} scale={scale} searchQuery={activeSearch} annotations={pageAnnotations} activeAnnotationId={activeAnnotationId} onTextSelection={setTextSelection} />
        </section>
        <PaperSidebar
          paper={{ ...paper, pageCount: document.numPages }} pageNumber={pageNumber} annotations={annotations} activeAnnotationId={activeAnnotationId}
          onGoToAnnotation={(annotation) => { goToPage(annotation.pageNumber); setActiveAnnotationId(annotation.id) }}
          onUpdateAnnotation={(annotation, content) => void updateAnnotationContent(annotation.id, content, userId)}
          onDeleteAnnotation={(annotation) => void deleteAnnotation(annotation.id, userId)}
          onGenerateNode={(annotation) => setGenerationSource({ annotation, isNew: false })}
          onGoToNode={(documentId, nodeId) => navigate(`/map/${documentId}?nodeId=${encodeURIComponent(nodeId)}`)}
        />
      </div>
      {createdNodeTitle && <div className="paper-node-created">已创建节点“{createdNodeTitle}”<button onClick={() => setCreatedNodeTitle('')}>×</button></div>}
      {textSelection && !generationSource && <AnnotationToolbar key={`${textSelection.pageNumber}-${textSelection.anchor.left}-${textSelection.anchor.top}`} selection={textSelection} onCreate={saveAnnotation} onGenerate={generateFromSelection} onClose={() => { setTextSelection(undefined); window.getSelection()?.removeAllRanges() }} />}
      {generationSource && <CreateNodeFromAnnotationDialog
        key={generationSource.annotation.id} paper={paper} annotation={generationSource.annotation}
        defaultDocumentId={searchParams.get('documentId') ?? undefined} defaultNodeId={searchParams.get('nodeId') ?? undefined}
        onClose={() => setGenerationSource(undefined)} onConfirm={confirmNodeGeneration}
      />}
    </main>
  )
}
