import type { AnnotationRect } from '../../types/annotation'

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
  return rects.flatMap((rect) => {
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
  })
}

export function selectionAnchor(rects: RectLike[]) {
  if (!rects.length) return { left: 0, top: 0 }
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  return { left: (left + right) / 2, top }
}
