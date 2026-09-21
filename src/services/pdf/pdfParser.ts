import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'

export async function loadPdfDocument(blob: Blob) {
  GlobalWorkerOptions.workerSrc = workerUrl
  const data = new Uint8Array(await blob.arrayBuffer())
  const loadingTask = getDocument({ data, useSystemFonts: true })
  return {
    document: await loadingTask.promise,
    destroy: () => loadingTask.destroy(),
  }
}

export interface PdfSearchResult {
  pageNumber: number
  occurrences: number
}

const pageTextCache = new WeakMap<PDFDocumentProxy, Map<number, string>>()

export async function searchPdfDocument(
  document: PDFDocumentProxy,
  query: string,
  onProgress?: (completed: number) => void,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []
  const cache = pageTextCache.get(document) ?? new Map<number, string>()
  pageTextCache.set(document, cache)
  const results: PdfSearchResult[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    let text = cache.get(pageNumber)
    if (text === undefined) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      text = content.items
        .map((item) => 'str' in item ? item.str : '').join(' ').toLocaleLowerCase()
      cache.set(pageNumber, text)
    }
    let occurrences = 0
    let offset = 0
    while ((offset = text.indexOf(normalizedQuery, offset)) >= 0) {
      occurrences += 1
      offset += Math.max(normalizedQuery.length, 1)
    }
    if (occurrences) results.push({ pageNumber, occurrences })
    onProgress?.(pageNumber)
  }
  return results
}
