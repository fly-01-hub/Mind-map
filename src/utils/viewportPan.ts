export interface ViewportRect { left: number; top: number; right: number; bottom: number }

// Screen-space deltas, independent of zoom. Oversized targets must not bounce
// between opposite edges; the caller can supply the caret on an oversized axis.
export function minimalViewportPan(target: ViewportRect, viewport: ViewportRect) {
  const axis = (start: number, end: number, min: number, max: number) => {
    if (max <= min) return 0
    if (end - start > max - min) {
      if (end < min) return min - end
      if (start > max) return max - start
      return 0
    }
    if (start < min) return min - start
    if (end > max) return max - end
    return 0
  }
  return { x: axis(target.left, target.right, viewport.left, viewport.right),
    y: axis(target.top, target.bottom, viewport.top, viewport.bottom) }
}
