import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import type { AnnotationRect, PaperAnnotation, PdfTextSelection } from '../../types/annotation'
import { anchoredAnnotationRects, createTextAnchorIndex, normalizeSelectionRects, selectionAnchor, textInArea, textSelectionRects } from '../../services/pdf/annotationService'
import { AnnotationLayer } from './AnnotationLayer'

interface PdfViewerProps {
  document: PDFDocumentProxy
  pageNumber: number
  scale: number
  searchQuery: string
  annotations: PaperAnnotation[]
  activeAnnotationId?: string
  onTextSelection: (selection?: PdfTextSelection) => void
  areaMode?: boolean
  areaStyle?: 'highlight' | 'outline'
  onAnnotationActivate?: (annotation: PaperAnnotation) => void
  isCurrentPage?: boolean
  onPageSize?: (size: { width: number; height: number }) => void
  onLocateAnnotation?: (mark: HTMLElement, id: string) => void
}

export function PdfViewer({ document, pageNumber, scale, searchQuery, annotations, activeAnnotationId, onTextSelection, areaMode, areaStyle = 'outline', onAnnotationActivate, isCurrentPage = true, onPageSize, onLocateAnnotation }: PdfViewerProps) {
  const reportSize = useEffectEvent((size: { width: number; height: number }) => onPageSize?.(size))
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState('')
  const pageMetricsRef = useRef({ width: 0, height: 0, rotation: 0 })
  const areaStartRef = useRef<{ x: number; y: number; pointerId: number } | undefined>(undefined)
  const [areaRect, setAreaRect] = useState<AnnotationRect>()
  const [textLayout, setTextLayout] = useState<{
    layer: HTMLDivElement; page: HTMLDivElement; index: ReturnType<typeof createTextAnchorIndex>
    pdf: PDFDocumentProxy; pageNumber: number; scale: number; searchQuery: string
  }>()
  const displayAnnotations = useMemo(() => {
    if (rendering || !textLayout || textLayout.pdf !== document || textLayout.pageNumber !== pageNumber || textLayout.scale !== scale || textLayout.searchQuery !== searchQuery) return []
    const { layer, page, index } = textLayout, bounds = page.getBoundingClientRect()
    return annotations.map((annotation) => ({ ...annotation, positionData: { ...annotation.positionData, rects: anchoredAnnotationRects(annotation, layer, bounds, index) } }))
  }, [annotations, rendering, textLayout, document, scale, pageNumber, searchQuery])
  const normalizedPoint = (x: number, y: number) => {
    const bounds = pageRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (x - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (y - bounds.top) / bounds.height)) }
  }
  const rectangle = (x: number, y: number) => {
    const start = areaStartRef.current!
    const end = normalizedPoint(x, y)
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }
  }

  useEffect(() => {
    let disposed = false
    let renderTask: RenderTask | undefined
    let textLayer: TextLayer | undefined
    const render = async () => {
      areaStartRef.current = undefined
      setAreaRect(undefined)
      setRendering(true)
      setError('')
      try {
        const page = await document.getPage(pageNumber)
        if (disposed) return
        const viewport = page.getViewport({ scale })
        const baseViewport = page.getViewport({ scale: 1 })
        reportSize({ width: baseViewport.width, height: baseViewport.height })
        pageMetricsRef.current = { width: baseViewport.width, height: baseViewport.height, rotation: viewport.rotation }
        const canvas = canvasRef.current
        const pageElement = pageRef.current
        const textElement = textLayerRef.current
        if (!canvas || !pageElement || !textElement) return

        const outputScale = Math.max(window.devicePixelRatio || 1, 1)
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        pageElement.style.width = `${Math.floor(viewport.width)}px`
        pageElement.style.height = `${Math.floor(viewport.height)}px`
        pageElement.style.setProperty('--scale-factor', String(scale))
        pageElement.style.setProperty('--user-unit', '1')
        pageElement.style.setProperty('--total-scale-factor', String(scale))
        textElement.replaceChildren()

        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('浏览器无法创建 PDF 画布。')
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        })
        // Attach a rejection handler immediately: rapid paging/zooming can
        // cancel rendering while text extraction is still in flight.
        const [, textContent] = await Promise.all([renderTask.promise, page.getTextContent()])
        if (disposed) return

        textLayer = new TextLayer({ textContentSource: textContent, container: textElement, viewport })
        await textLayer.render()
        if (disposed) return
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
        if (normalizedQuery) {
          textLayer.textContentItemsStr.forEach((text, index) => {
            if (text.toLocaleLowerCase().includes(normalizedQuery)) textLayer?.textDivs[index]?.classList.add('pdf-search-hit')
          })
        }
        setTextLayout({ layer: textElement, page: pageElement, index: createTextAnchorIndex(textElement), pdf: document, pageNumber, scale, searchQuery })
        setRendering(false)
      } catch (reason) {
        if (disposed || (reason instanceof Error && reason.name === 'RenderingCancelledException')) return
        setRendering(false)
        setError(reason instanceof Error ? reason.message : 'PDF 页面渲染失败。')
      }
    }
    void render()
    return () => {
      disposed = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [document, pageNumber, scale, searchQuery])

  useEffect(() => {
    if (!areaMode) {
      areaStartRef.current = undefined
      const frame = requestAnimationFrame(() => setAreaRect(undefined))
      return () => cancelAnimationFrame(frame)
    }
  }, [areaMode])

  const captureSelection = () => {
    if (areaMode) return
    window.setTimeout(() => {
      const selection = window.getSelection()
      const pageElement = pageRef.current
      if (!selection || selection.isCollapsed || !selection.rangeCount || !pageElement) return
      if (!pageElement.contains(selection.anchorNode) || !pageElement.contains(selection.focusNode)) return
      const selectedText = selection.toString().replace(/\s+/g, ' ').trim()
      if (!selectedText) return
      if (!textLayerRef.current) return
      const clientRects = textSelectionRects(selection.getRangeAt(0), textLayerRef.current)
      const pageRect = pageElement.getBoundingClientRect()
      const rects = normalizeSelectionRects(clientRects, pageRect)
      if (!rects.length) return
      const metrics = pageMetricsRef.current
      onTextSelection({
        pageNumber,
        selectedText,
        positionData: { version: 1, pageWidth: metrics.width, pageHeight: metrics.height, rotation: metrics.rotation, rects },
        anchor: selectionAnchor(clientRects),
      })
    }, 0)
  }

  return (
    <div className="pdf-page-shell" data-current-page={isCurrentPage} aria-busy={rendering}>
      {rendering && <div className="pdf-rendering"><span />正在渲染第 {pageNumber} 页…</div>}
      {error && <div className="paper-error-state">{error}</div>}
      <div ref={pageRef} className="pdf-page" data-current-page={isCurrentPage} data-page-number={pageNumber} onPointerUp={captureSelection} onClick={(event) => {
        if (areaMode || !window.getSelection()?.isCollapsed) return
        const point = normalizedPoint(event.clientX, event.clientY)
        const hit = [...displayAnnotations].reverse().find((annotation) => annotation.positionData.rects.some((rect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height))
        if (hit) onAnnotationActivate?.(hit)
      }}>
        <canvas ref={canvasRef} aria-label={`论文第 ${pageNumber} 页`} />
        <AnnotationLayer annotations={displayAnnotations} activeAnnotationId={activeAnnotationId} onLocate={onLocateAnnotation} />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" />
        {areaMode && !rendering && <div className="pdf-area-selector" aria-label="拖动框选图表区域" onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault(); window.getSelection()?.removeAllRanges(); onTextSelection(undefined)
          areaStartRef.current = { ...normalizedPoint(event.clientX, event.clientY), pointerId: event.pointerId }
          event.currentTarget.setPointerCapture(event.pointerId); setAreaRect(undefined)
        }} onPointerMove={(event) => { if (areaStartRef.current?.pointerId === event.pointerId) setAreaRect(rectangle(event.clientX, event.clientY)) }} onPointerCancel={() => { areaStartRef.current = undefined; setAreaRect(undefined) }} onPointerUp={(event) => {
          if (areaStartRef.current?.pointerId !== event.pointerId) return
          const rect = rectangle(event.clientX, event.clientY)
          areaStartRef.current = undefined
          const canvas = canvasRef.current
          if (!canvas || !pageRef.current || rect.width * pageRef.current.clientWidth < 8 || rect.height * pageRef.current.clientHeight < 8) { setAreaRect(undefined); return }
          setAreaRect(rect)
          const crop = window.document.createElement('canvas')
          const width = rect.width * canvas.width, height = rect.height * canvas.height
          const ratio = Math.min(1, 1200 / Math.max(width, height))
          crop.width = Math.max(1, Math.round(width * ratio)); crop.height = Math.max(1, Math.round(height * ratio))
          crop.getContext('2d')?.drawImage(canvas, rect.x * canvas.width, rect.y * canvas.height, width, height, 0, 0, crop.width, crop.height)
          const metrics = pageMetricsRef.current
          const excerpt = areaStyle === 'highlight' && textLayerRef.current ? textInArea(textLayerRef.current, pageRef.current.getBoundingClientRect(), rect) : ''
          onTextSelection({ kind: 'area', areaStyle, previewImage: crop.toDataURL('image/png'), selectedText: excerpt || `第 ${pageNumber} 页${areaStyle === 'highlight' ? '区域高亮' : '区域批注'}`, pageNumber, positionData: { version: 1, pageWidth: metrics.width, pageHeight: metrics.height, rotation: metrics.rotation, rects: [rect] }, anchor: { left: event.clientX, top: event.clientY } })
        }}>{areaRect && <div className={`pdf-area-draft ${areaStyle === 'highlight' ? 'highlight-draft' : ''}`} style={{ left: `${areaRect.x * 100}%`, top: `${areaRect.y * 100}%`, width: `${areaRect.width * 100}%`, height: `${areaRect.height * 100}%` }} />}</div>}
      </div>
    </div>
  )
}
