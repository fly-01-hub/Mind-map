import { useEffect, useRef, useState } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import type { PaperAnnotation, PdfTextSelection } from '../../types/annotation'
import { normalizeSelectionRects, selectionAnchor } from '../../services/pdf/annotationService'
import { AnnotationLayer } from './AnnotationLayer'

interface PdfViewerProps {
  document: PDFDocumentProxy
  pageNumber: number
  scale: number
  searchQuery: string
  annotations: PaperAnnotation[]
  activeAnnotationId?: string
  onTextSelection: (selection?: PdfTextSelection) => void
}

export function PdfViewer({ document, pageNumber, scale, searchQuery, annotations, activeAnnotationId, onTextSelection }: PdfViewerProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState('')
  const pageMetricsRef = useRef({ width: 0, height: 0, rotation: 0 })

  useEffect(() => {
    let disposed = false
    let renderTask: RenderTask | undefined
    let textLayer: TextLayer | undefined
    const render = async () => {
      setRendering(true)
      setError('')
      try {
        const page = await document.getPage(pageNumber)
        if (disposed) return
        const viewport = page.getViewport({ scale })
        const baseViewport = page.getViewport({ scale: 1 })
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
        const textContent = await page.getTextContent()
        await renderTask.promise
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

  const captureSelection = () => {
    window.setTimeout(() => {
      const selection = window.getSelection()
      const pageElement = pageRef.current
      if (!selection || selection.isCollapsed || !selection.rangeCount || !pageElement) return
      if (!pageElement.contains(selection.anchorNode) || !pageElement.contains(selection.focusNode)) return
      const selectedText = selection.toString().replace(/\s+/g, ' ').trim()
      if (!selectedText) return
      const clientRects = Array.from(selection.getRangeAt(0).getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
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
    <div className="pdf-page-shell" aria-busy={rendering}>
      {rendering && <div className="pdf-rendering"><span />正在渲染第 {pageNumber} 页…</div>}
      {error && <div className="paper-error-state">{error}</div>}
      <div ref={pageRef} className="pdf-page" data-page-number={pageNumber} onPointerUp={captureSelection}>
        <canvas ref={canvasRef} aria-label={`论文第 ${pageNumber} 页`} />
        <AnnotationLayer annotations={annotations} activeAnnotationId={activeAnnotationId} />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" />
      </div>
    </div>
  )
}
