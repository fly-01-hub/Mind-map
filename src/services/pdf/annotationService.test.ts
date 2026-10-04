import { describe, expect, it } from 'vitest'
import { mergeTextRects, normalizeSelectionRects, selectionAnchor } from './annotationService'

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, right: left + width, bottom: top + height, width, height,
})

describe('annotation geometry', () => {
  it('merges justified line fragments and duplicate boxes without mutating saved coordinates', () => {
    const rects = [{ x: .1, y: .2, width: .1, height: .02 }, { x: .205, y: .2, width: .12, height: .02 }, { x: .1, y: .2, width: .1, height: .02 }]
    const original = structuredClone(rects)
    const result = mergeTextRects(rects, .75)
    expect(result).toHaveLength(1)
    expect(result[0].width).toBeCloseTo(.225)
    expect(rects).toEqual(original)
  })

  it('keeps columns, adjacent lines and superscripts separate', () => {
    expect(mergeTextRects([
      { x: .1, y: .2, width: .2, height: .02 },
      { x: .55, y: .2, width: .2, height: .02 },
      { x: .1, y: .23, width: .2, height: .02 },
      { x: .3, y: .198, width: .01, height: .009 },
    ])).toHaveLength(4)
  })

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
