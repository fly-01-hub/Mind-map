import type { AnnotationRect, PaperAnnotation } from '../../types/annotation'

interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function normalizeSelectionRects(rects: RectLike[], pageRect: RectLike): AnnotationRect[] {
  if (pageRect.width <= 0 || pageRect.height <= 0) return []
  return mergeTextRects(rects.flatMap((rect) => {
    const left = Math.max(rect.left, pageRect.left)
    const top = Math.max(rect.top, pageRect.top)
    const right = Math.min(rect.right, pageRect.right)
    const bottom = Math.min(rect.bottom, pageRect.bottom)
    if (right <= left || bottom <= top) return []
    return [{
      x: clamp((left - pageRect.left) / pageRect.width),
      y: clamp((top - pageRect.top) / pageRect.height),
      width: clamp((right - left) / pageRect.width),
      height: clamp((bottom - top) / pageRect.height),
    }]
  }), pageRect.width / pageRect.height)
}

// Merge adjacent fragments on one baseline, including justified word gaps,
// without bridging independent columns or superscripts. Work on copies only.
export function mergeTextRects(rects: AnnotationRect[], pageAspect = 1): AnnotationRect[] {
  const lines: AnnotationRect[] = []
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (rect.width <= 0 || rect.height <= 0) continue
    const line = lines.find((other) => {
      const height = Math.min(rect.height, other.height)
      const gap = Math.max(rect.x, other.x) - Math.min(rect.x + rect.width, other.x + other.width)
      return Math.abs(rect.y + rect.height / 2 - other.y - other.height / 2) < height * .22
        && Math.max(rect.height, other.height) < height * 1.3
        && gap < height / pageAspect * .85
    })
    if (!line) { lines.push({ ...rect }); continue }
    const right = Math.max(line.x + line.width, rect.x + rect.width)
    const bottom = Math.max(line.y + line.height, rect.y + rect.height)
    line.x = Math.min(line.x, rect.x); line.y = Math.min(line.y, rect.y)
    line.width = right - line.x; line.height = bottom - line.y
  }
  return lines
}

interface TextPoint { node: Text; offset: number }
// Whitespace differs between PDF producers, so index actual characters and
// retain their DOM offsets. Used to repair legacy boxes at display time only.
export function createTextAnchorIndex(layer: HTMLElement) {
  const points: TextPoint[] = []
  let text = ''
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const value = node.textContent ?? ''
    for (let offset = 0; offset < value.length; offset++) {
      if (!/\s/.test(value[offset])) { text += value[offset]; points.push({ node: node as Text, offset }) }
    }
    node = walker.nextNode()
  }
  return { text, points }
}

export function anchoredAnnotationRects(annotation: PaperAnnotation, layer: HTMLElement, pageRect: RectLike, index = createTextAnchorIndex(layer)): AnnotationRect[] {
  if (annotation.annotationType === 'area') return annotation.positionData.rects
  const query = annotation.selectedText.replace(/\s/g, '')
  const fallback = mergeTextRects(annotation.positionData.rects, pageRect.width / pageRect.height)
  if (!query) return fallback
  let best: AnnotationRect[] | undefined
  let distance = Infinity
  let start = index.text.indexOf(query)
  while (start >= 0) {
    const first = index.points[start], last = index.points[start + query.length - 1]
    const range = document.createRange()
    range.setStart(first.node, first.offset); range.setEnd(last.node, last.offset + 1)
    const rects = normalizeSelectionRects(textSelectionRects(range, layer), pageRect)
    const old = annotation.positionData.rects[0]
    // Repeated quotations resolve by nearest original location, not first hit.
    const score = rects[0] && old ? Math.hypot(rects[0].x - old.x, rects[0].y - old.y) : Infinity
    if (score < distance) { distance = score; best = rects }
    start = index.text.indexOf(query, start + 1)
  }
  // Do not relocate an ambiguous quote to a distant part of the page.
  return best && distance < .12 ? best : fallback
}

export function textInArea(layer: HTMLElement, pageRect: RectLike, area: AnnotationRect): string {
  const index = createTextAnchorIndex(layer)
  const parts: string[] = []
  let previous: TextPoint | undefined
  for (const point of index.points) {
    const range = document.createRange(); range.setStart(point.node, point.offset); range.setEnd(point.node, point.offset + 1)
    const bounds = range.getBoundingClientRect()
    const x = (bounds.left + bounds.width / 2 - pageRect.left) / pageRect.width
    const y = (bounds.top + bounds.height / 2 - pageRect.top) / pageRect.height
    if (x < area.x || x > area.x + area.width || y < area.y || y > area.y + area.height) { previous = undefined; continue }
    if (parts.length && (!previous || previous.node !== point.node || previous.offset + 1 !== point.offset)) parts.push(' ')
    parts.push(point.node.data[point.offset]); previous = point
  }
  return parts.join('').trim()
}

export function selectionAnchor(rects: RectLike[]) {
  if (!rects.length) return { left: 0, top: 0 }
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  return { left: (left + right) / 2, top }
}

// Range.getClientRects() across several PDF spans includes whole element
// boxes as well as selected text. Read only intersecting text-node ranges.
export function textSelectionRects(range: Range, layer: HTMLElement): DOMRect[] {
  const result: DOMRect[] = []
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node) && node.textContent?.trim()) {
      const part = document.createRange()
      part.selectNodeContents(node)
      if (range.startContainer === node) part.setStart(node, range.startOffset)
      if (range.endContainer === node) part.setEnd(node, range.endOffset)
      if (!part.collapsed) result.push(...Array.from(part.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0))
    }
    node = walker.nextNode()
  }
  return result
}
