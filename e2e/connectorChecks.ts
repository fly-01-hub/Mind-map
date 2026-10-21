import type { Page } from '@playwright/test'

// Screen-space comparison also works with production builds and real map
// copies. It reads geometry only and never changes the tree or viewport.
export async function connectorError(page: Page) {
  return page.evaluate(() => {
    const errors: number[] = []
    const point = (path: SVGPathElement, end: boolean) => {
      const p = path.getPointAtLength(end ? path.getTotalLength() : 0)
      return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!)
    }
    const distance = (p: DOMPoint, x: number, y: number) => Math.hypot(p.x - x, p.y - y)
    const canvas = document.querySelector<HTMLElement>('.map-canvas')!
    const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth
    const gap = parseFloat((document.querySelector('.map-container') as HTMLElement).style.getPropertyValue('--node-gap-x'))
    const branches = [...document.querySelectorAll<HTMLElement>('.me-main > .me-wrapper')]
    const mainPaths = document.querySelectorAll<SVGPathElement>('.lines > path')
    branches.forEach((branch, i) => {
      const rect = branch.querySelector<HTMLElement>('.me-tpc')!.getBoundingClientRect()
      errors.push(mainPaths[i] ? distance(point(mainPaths[i], true), rect.left, (rect.top + rect.bottom) / 2) : 999999)
      const paths = branch.querySelectorAll<SVGPathElement>(':scope > .subLines > path')
      let index = 0
      const walk = (wrapper: Element, first: boolean) => {
        const parent = wrapper.firstElementChild!
        const children = wrapper.children[1]
        if (!children?.classList.contains('me-children')) return
        for (const child of children.children) {
          const from = parent.firstElementChild!.getBoundingClientRect()
          const to = child.firstElementChild!.firstElementChild!.getBoundingClientRect()
          const path = paths[index++]
          if (!path) { errors.push(999999); continue }
          // The built-in theme starts main-branch curves inside the card;
          // other paths join its underline six layout pixels below the card.
          errors.push(distance(point(path, false), from.right - (first ? gap * scale : 0), first ? (from.top + from.bottom) / 2 : from.bottom + 6 * scale))
          errors.push(distance(point(path, true), to.right, to.bottom + 6 * scale))
          walk(child, false)
        }
      }
      walk(branch, true)
      if (index !== paths.length) errors.push(999999)
    })
    return { count: errors.length, max: Math.max(0, ...errors) }
  })
}
