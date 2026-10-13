import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PaperAnnotation, PdfTextSelection } from '../../types/annotation'
import { PdfViewer } from './PdfViewer'

interface PageSize { width: number; height: number }
const emptyAnnotations: PaperAnnotation[] = []
export interface PdfReadingPosition { pageNumber: number; offset: number }
interface ContinuousPdfViewerProps {
  document: PDFDocumentProxy
  workspaceRef: RefObject<HTMLElement | null>
  navigation: PdfReadingPosition
  pageNumber: number
  scale: number
  searchQuery: string
  annotations: PaperAnnotation[]
  activeAnnotationId?: string
  areaMode: boolean
  areaStyle: 'highlight' | 'outline'
  onTextSelection: (selection?: PdfTextSelection) => void
  onAnnotationActivate: (annotation: PaperAnnotation) => void
  onPositionChange: (position: PdfReadingPosition) => void
}

export function ContinuousPdfViewer(props: ContinuousPdfViewerProps) {
  const { document, workspaceRef, navigation, pageNumber, scale } = props
  const pagesRef = useRef<HTMLDivElement>(null)
  const [firstSize, setFirstSize] = useState<PageSize>()
  const [error, setError] = useState('')
  const [sizes, setSizes] = useState<Record<number, PageSize>>({})
  const sizesRef = useRef<Record<number, PageSize>>({})
  const resizeAnchorRef = useRef<PdfReadingPosition | undefined>(undefined)
  const [nearby, setNearby] = useState<Set<number>>(() => new Set([navigation.pageNumber]))
  const lastNavigationRef = useRef(navigation)
  const positionRef = useRef(navigation)
  const locatedAnnotationRef = useRef<{ id: string; navigation: PdfReadingPosition } | undefined>(undefined)
  const annotationsByPage = useMemo(() => {
    const groups = new Map<number, PaperAnnotation[]>()
    for (const annotation of props.annotations) {
      const group = groups.get(annotation.pageNumber) ?? []
      group.push(annotation); groups.set(annotation.pageNumber, group)
    }
    return groups
  }, [props.annotations])
  const locateAnnotation = useCallback((mark: HTMLElement, id: string) => {
    const last = locatedAnnotationRef.current
    if (last?.id === id && last.navigation === navigation) return
    locatedAnnotationRef.current = { id, navigation }
    const viewport = workspaceRef.current?.getBoundingClientRect()
    const bounds = mark.getBoundingClientRect()
    if (viewport && (bounds.top < viewport.top || bounds.bottom > viewport.bottom || bounds.left < viewport.left || bounds.right > viewport.right)) {
      mark.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
    }
  }, [navigation, workspaceRef])

  useEffect(() => {
    let disposed = false
    void document.getPage(1).then(page => {
      const viewport = page.getViewport({ scale: 1 })
      if (!disposed) setFirstSize({ width: viewport.width, height: viewport.height })
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : '无法准备 PDF 页面。') })
    return () => { disposed = true }
  }, [document])

  const reportPosition = useEffectEvent(() => {
    const workspace = workspaceRef.current
    const slots = pagesRef.current?.children
    if (!workspace || !slots?.length) return
    const top = workspace.getBoundingClientRect().top
    // The reading line near the top of the viewport determines the current page.
    const readingLine = top + Math.min(160, workspace.clientHeight * .25)
    let low = 0, high = slots.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (slots[middle].getBoundingClientRect().bottom < readingLine) low = middle + 1
      else high = middle
    }
    if (workspace.scrollHeight - workspace.scrollTop <= workspace.clientHeight + 2) low = slots.length - 1
    const bounds = slots[low].getBoundingClientRect()
    const offset = Math.max(0, Math.min(1, (top - bounds.top) / bounds.height))
    positionRef.current = { pageNumber: low + 1, offset }
    props.onPositionChange(positionRef.current)
  })

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace || !pagesRef.current || !firstSize) return
    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; reportPosition() })
    }
    const observer = new IntersectionObserver(entries => {
      setNearby(current => {
        const next = new Set(current)
        for (const entry of entries) {
          const number = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (entry.isIntersecting) next.add(number)
          else next.delete(number)
        }
        return next
      })
    }, { root: workspace, rootMargin: '500px 0px' })
    for (const slot of pagesRef.current.children) observer.observe(slot)
    const resize = new ResizeObserver(schedule)
    resize.observe(workspace)
    workspace.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => {
      observer.disconnect(); resize.disconnect()
      workspace.removeEventListener('scroll', schedule)
      cancelAnimationFrame(frame)
    }
  }, [firstSize, workspaceRef])

  useLayoutEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace || !firstSize) return
    const changedNavigation = lastNavigationRef.current !== navigation
    const position = changedNavigation ? navigation : positionRef.current
    const slot = pagesRef.current?.children[position.pageNumber - 1] as HTMLElement | undefined
    if (!slot) return
    // First mount and explicit jumps scroll once; ordinary scroll-driven page
    // changes must never jump back to the top of a page.
    const bounds = slot.getBoundingClientRect()
    const viewport = workspace.getBoundingClientRect()
    workspace.scrollTop += bounds.top - viewport.top + position.offset * slot.clientHeight - (position.offset ? 0 : 16)
    lastNavigationRef.current = navigation
    positionRef.current = position
  }, [firstSize, navigation, scale, workspaceRef])

  const rememberSize = useCallback((number: number, size: PageSize) => {
    const previous = sizesRef.current[number] ?? firstSize
    if (sizesRef.current[number]?.width === size.width && sizesRef.current[number]?.height === size.height) return
    if (previous && previous.height !== size.height && number <= positionRef.current.pageNumber) resizeAnchorRef.current = { ...positionRef.current }
    sizesRef.current = { ...sizesRef.current, [number]: size }
    setSizes(sizesRef.current)
  }, [firstSize])
  useLayoutEffect(() => {
    const position = resizeAnchorRef.current
    resizeAnchorRef.current = undefined
    const workspace = workspaceRef.current
    const slot = position && pagesRef.current?.children[position.pageNumber - 1] as HTMLElement | undefined
    if (!position || !workspace || !slot) return
    workspace.scrollTop += slot.getBoundingClientRect().top - workspace.getBoundingClientRect().top + position.offset * slot.clientHeight
  }, [sizes, workspaceRef])

  if (error) return <div className="paper-error-state" role="alert">{error}</div>
  if (!firstSize) return <div className="pdf-rendering">正在准备连续阅读…</div>
  return <div ref={pagesRef} className="pdf-continuous-pages" aria-label="PDF 连续阅读">
    {Array.from({ length: document.numPages }, (_, index) => {
      const number = index + 1
      const size = sizes[number] ?? firstSize
      const current = number === pageNumber
      return <div key={number} className="pdf-page-slot" data-page-number={number} style={{ minWidth: Math.floor(size.width * scale), height: Math.floor(size.height * scale) }}>
        {nearby.has(number) || current ? <PdfViewer
          document={document} pageNumber={number} scale={scale} isCurrentPage={current}
          searchQuery={props.searchQuery}
          annotations={annotationsByPage.get(number) ?? emptyAnnotations}
          activeAnnotationId={props.activeAnnotationId}
          onTextSelection={props.onTextSelection}
          areaMode={props.areaMode && current} areaStyle={props.areaStyle}
          onAnnotationActivate={props.onAnnotationActivate}
          onLocateAnnotation={locateAnnotation}
          onPageSize={size => rememberSize(number, size)}
        /> : <div className="pdf-page-placeholder">第 {number} 页</div>}
      </div>
    })}
  </div>
}
