import { describe, expect, it } from 'vitest'
import { normalizeSelectionRects, selectionAnchor } from './annotationService'

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, right: left + width, bottom: top + height, width, height,
})

describe('annotation geometry', () => {
  it('normalizes multi-line selection rectangles relative to the PDF page', () => {
    const page = rect(100, 50, 800, 1000)
    const result = normalizeSelectionRects([rect(180, 150, 400, 20), rect(180, 175, 220, 20)], page)
    expect(result).toEqual([
      { x: .1, y: .1, width: .5, height: .02 },
      { x: .1, y: .125, width: .275, height: .02 },
    ])
  })

  it('clips selection geometry to page bounds and finds a toolbar anchor', () => {
    const page = rect(100, 100, 400, 600)
    expect(normalizeSelectionRects([rect(80, 90, 80, 40)], page)).toEqual([
      { x: 0, y: 0, width: .15, height: .05 },
    ])
    expect(selectionAnchor([rect(120, 180, 100, 20), rect(120, 205, 70, 20)])).toEqual({ left: 170, top: 180 })
  })
})
