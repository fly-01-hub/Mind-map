import { expect, type Locator, type Page } from '@playwright/test'

async function position(target: Locator) {
  const rect = (await target.boundingBox())!
  return { x: rect.x, y: rect.y }
}

async function staysAt(target: Locator, point: { x: number; y: number }) {
  await expect.poll(async () => {
    const rect = await target.boundingBox()
    return rect ? { x: Math.abs(rect.x - point.x) < 2, y: Math.abs(rect.y - point.y) < 2 } : null
  }).toEqual({ x: true, y: true })
}

async function pan(page: Page, x: number, y: number) {
  const rect = (await page.locator('.mindmap-stage').boundingBox())!
  await page.mouse.move(rect.x + 60, rect.y + 90)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(rect.x + 60 + x, rect.y + 90 + y, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
}

// Isolated browser / packaged desktop / Android production UI. Never operates
// on the user's real ResearchMind profile. All mutations use visible controls.
export async function checkViewportStability(page: Page, screenshots: string) {
  await page.getByRole('button', { name: '新建思维导图' }).first().click()
  await page.getByLabel('文档名称', { exact: true }).fill('编辑不跳动画布调试')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const root = page.locator('.me-root .me-tpc')
  await expect(root).toBeVisible()
  await root.click()
  const rootPoint = await position(root)
  await page.getByRole('button', { name: '添加子主题', exact: true }).click()
  const editor = page.locator('#input-box[contenteditable]')
  await expect(editor).toBeVisible()
  await staysAt(root, rootPoint)
  await editor.fill('父主题')
  await editor.press('Escape')
  const parent = page.locator('.me-tpc', { hasText: '父主题' })
  const parentPoint = await position(parent)
  await parent.dblclick()
  await staysAt(editor, parentPoint)
  await editor.fill('父主题增加一点内容')
  await staysAt(editor, parentPoint)
  await editor.press('Escape')
  await staysAt(parent, parentPoint)
  await page.getByRole('button', { name: '添加子主题', exact: true }).click()
  await editor.fill('保留位置的下级')
  await editor.press('Escape')
  await staysAt(parent, parentPoint)

  // Put a visible parent inside the engine's old 50px recenter threshold.
  // Clicking it must not move it, even though another branch is off-screen.
  const host = (await page.locator('.mindmap-canvas').boundingBox())!
  const rect = (await parent.boundingBox())!
  const right = Math.min(host.x + host.width, page.viewportSize()?.width ?? host.x + host.width)
  await pan(page, right - 12 - rect.x - rect.width, 0)
  await page.locator('.mindmap-stage').click({ position: { x: 30, y: 45 } })
  const edgePoint = await position(parent)
  await parent.click()
  await staysAt(parent, edgePoint)
  // Also leave only a small clickable portion of the parent on-screen.
  // The old engine recentres this case as soon as the user selects it.
  await pan(page, right - 24 - edgePoint.x, 0)
  const clippedPoint = await position(parent)
  await parent.click({ position: { x: 8, y: 8 } })
  await staysAt(parent, clippedPoint)
  await page.screenshot({ path: `${screenshots}-edge-selection.png` })

  // Move to a comfortable editing position; ordinary growth must stay still.
  await pan(page, -300, 0)
  await parent.dblclick()
  const editPoint = await position(editor)
  await editor.fill('父主题连续输入，不在屏幕中央跳动')
  await staysAt(editor, editPoint)
  // Grow until it really overflows: only the missing horizontal space is panned.
  const beforeGrowth = (await editor.boundingBox())!
  await editor.fill('父主题记录很多内容，正在输入的文字应当保持可见。'.repeat(8))
  await expect.poll(async () => {
    const box = (await editor.boundingBox())!
    return box.x + box.width + 40 <= right - 15
  }).toBe(true)
  const afterGrowth = (await editor.boundingBox())!
  expect(afterGrowth.x).toBeLessThan(beforeGrowth.x)
  expect(Math.abs(afterGrowth.y - beforeGrowth.y)).toBeLessThan(2)
  expect(Math.abs(afterGrowth.x + afterGrowth.width + 40 - (right - 16))).toBeLessThan(2)
  await expect(editor).toBeFocused()
  await page.screenshot({ path: `${screenshots}-growth.png` })

  // Content taller than the viewport follows its caret, never oscillates
  // between the editor's top and bottom and never scrolls hidden containers.
  await editor.fill(Array.from({ length: 42 }, (_, index) => `第${index + 1}行：很长的记录`).join('\n'))
  await editor.press('Control+End')
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return false
    const caret = selection.getRangeAt(0).getBoundingClientRect()
    const toolbar = document.querySelector('.map-selection-toolbar')!.getBoundingClientRect()
    return caret.height > 0 && caret.bottom <= toolbar.top - 11 && caret.top >= 72
  })).toBe(true)
  const tallPoint = await position(editor)
  await editor.press('ArrowLeft')
  await staysAt(editor, tallPoint)
  await page.screenshot({ path: `${screenshots}-tall-caret.png` })
  expect(await page.locator('.map-container').evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([0, 0])
  await editor.press('Control+Home')
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()
    return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect().top : 0
  })).toBeGreaterThanOrEqual(71)
  await editor.fill('父主题最终内容 [[不存在的测试目标]]')
  await editor.press('Escape')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await parent.dblclick({ position: { x: 8, y: 8 } })
  await expect(editor).toBeVisible()
  const zoomPoint = await position(editor)
  await editor.fill('父主题最终内容 [[不存在的测试目标]]')
  await staysAt(editor, zoomPoint)
  await editor.press('Escape')
  await staysAt(parent, zoomPoint)
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true }).filter({ hasText: '父主题最终内容' })).toContainText('[[不存在的测试目标]]')
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true }).filter({ hasText: '父主题最终内容' })).toContainText('[[不存在的测试目标]]')
}
