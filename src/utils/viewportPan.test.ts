import { describe, expect, it } from 'vitest'
import { minimalViewportPan } from './viewportPan'

const viewport = { left: 10, top: 20, right: 510, bottom: 420 }
describe('minimal viewport pan', () => {
  it('does not move fully visible content, including exact boundaries', () => {
    expect(minimalViewportPan(viewport, viewport)).toEqual({ x: 0, y: 0 })
    expect(minimalViewportPan({ left: 100, top: 100, right: 200, bottom: 200 }, viewport)).toEqual({ x: 0, y: 0 })
  })
  it('moves only the overflowing distance, on either axis and corner', () => {
    expect(minimalViewportPan({ left: 400, top: 400, right: 525, bottom: 443 }, viewport)).toEqual({ x: -15, y: -23 })
    expect(minimalViewportPan({ left: -5, top: 3, right: 100, bottom: 100 }, viewport)).toEqual({ x: 15, y: 17 })
  })
  it('does not bounce or chase both edges of oversized content', () => {
    expect(minimalViewportPan({ left: -100, top: -200, right: 800, bottom: 700 }, viewport)).toEqual({ x: 0, y: 0 })
    expect(minimalViewportPan({ left: 600, top: 500, right: 1500, bottom: 1100 }, viewport)).toEqual({ x: -90, y: -80 })
  })
  it('handles fractional screen coordinates and a collapsed viewport', () => {
    expect(minimalViewportPan({ left: 100, top: 100, right: 510.5, bottom: 420.25 }, viewport)).toEqual({ x: -.5, y: -.25 })
    expect(minimalViewportPan(viewport, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual({ x: 0, y: 0 })
  })
})
