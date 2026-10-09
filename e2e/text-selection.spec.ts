import { expect, test } from './fixtures'

test('keeps a mouse-dragged partial selection inside a mind-map topic and deletes it', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()

  const topic = page.locator('.me-tpc', { hasText: '分支甲项' }).first()
  await topic.dblclick()
  const editor = page.locator('#input-box[contenteditable]')
  await expect(editor).toBeVisible()

  const points = await editor.evaluate((element) => {
    const text = element.firstChild
    if (!(text instanceof Text)) throw new Error('Expected a text node')
    const caretX = (offset: number) => {
      const range = document.createRange()
      range.setStart(text, offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      return rect.left
    }
    const rect = element.getBoundingClientRect()
    return { fromX: caretX(1), toX: caretX(3), y: rect.top + rect.height / 2 }
  })

  await page.mouse.move(points.fromX, points.y)
  await page.mouse.down()
  await page.mouse.move(points.toX, points.y, { steps: 8 })
  await page.mouse.up()

  const selectionState = await editor.evaluate((element) => {
    const selection = window.getSelection()
    return {
      focused: document.activeElement === element,
      text: selection?.toString() ?? '',
      inside: Boolean(selection?.anchorNode && element.contains(selection.anchorNode)
        && selection.focusNode && element.contains(selection.focusNode)),
    }
  })
  expect(selectionState).toEqual({ focused: true, text: '支甲', inside: true })

  await page.keyboard.press('Backspace')
  await expect(editor).toHaveText('分项')
})

test('formats a partial mind-map topic selection and preserves it across views', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()

  const topic = page.locator('.me-tpc', { hasText: '分支甲项' }).first()
  await topic.dblclick()
  const editor = page.locator('#input-box[contenteditable]')
  await editor.evaluate((element) => {
    const text = element.firstChild
    if (!(text instanceof Text)) throw new Error('Expected a text node')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await editor.press('Control+B')
  await expect(editor.locator('strong, b')).toHaveText('分支')
  await page.locator('.mindmap-stage').click({ position: { x: 80, y: 100 } })

  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(page.locator('.outline-topic-input', { hasText: '分支甲项' }).locator('strong')).toHaveText('分支')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: '分支甲项' }).first().locator(':scope > .text strong')).toHaveText('分支')
})

test('keeps a mouse-dragged partial selection inside an outline topic and deletes it', async ({ page }) => {
  await page.goto('/map/test-map')
  const editor = page.locator('.outline-topic-input', { hasText: '分支甲项' }).first()
  const nodeId = await editor.locator('..').getAttribute('data-node-id')
  if (!nodeId) throw new Error('Expected a stable outline node id')
  const stableEditor = page.locator(`[data-node-id="${nodeId}"] .outline-topic-input`)
  await editor.click()

  const points = await editor.evaluate((element) => {
    const text = element.firstChild
    if (!(text instanceof Text)) throw new Error('Expected a text node')
    const caretX = (offset: number) => {
      const range = document.createRange()
      range.setStart(text, offset)
      range.collapse(true)
      return range.getBoundingClientRect().left
    }
    const rect = element.getBoundingClientRect()
    return { fromX: caretX(1), toX: caretX(3), y: rect.top + rect.height / 2 }
  })

  await page.mouse.move(points.fromX, points.y)
  await page.mouse.down()
  await page.mouse.move(points.toX, points.y, { steps: 8 })
  await page.mouse.up()

  const selectionState = await editor.evaluate((element) => {
    const selection = window.getSelection()
    return {
      focused: document.activeElement === element,
      text: selection?.toString() ?? '',
      inside: Boolean(selection?.anchorNode && element.contains(selection.anchorNode)
        && selection.focusNode && element.contains(selection.focusNode)),
    }
  })
  expect(selectionState).toEqual({ focused: true, text: '支甲', inside: true })
  await page.keyboard.press('Backspace')
  await expect(stableEditor).toHaveText('分项')
})

test('enters and exits an inline description with Shift+Enter', async ({ page }) => {
  await page.goto('/map/test-map')
  const editor = page.locator('.outline-topic-input', { hasText: '分支甲项' }).first()
  await editor.click()
  await editor.press('Shift+Enter')

  const description = page.getByLabel('分支甲项的描述')
  await expect(description).toBeFocused()
  await description.fill('这是主题的补充说明')
  await description.press('Shift+Enter')

  await expect(editor).toBeFocused()
  await expect(page.locator('.outline-description')).toContainText('这是主题的补充说明')
})

test('uses Mubu-style Tab and Shift+Enter while editing a mind-map topic', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()

  const topic = page.locator('.me-tpc', { hasText: '分支甲项' }).first()
  await topic.dblclick()
  let editor = page.locator('#input-box[contenteditable]')
  await expect(editor).toBeVisible()
  await editor.press('Shift+Enter')
  await expect(page.locator('#node-note')).toBeFocused()

  await topic.dblclick()
  editor = page.locator('#input-box[contenteditable]')
  await editor.press('Tab')
  await expect(page.locator('#input-box[contenteditable]')).toBeVisible()
  await expect(page.locator('.me-tpc')).toHaveCount(12)
})

test('uses Shift-click for non-destructive multi-selection in the mind-map', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc', { hasText: '分支甲项' }).first().click()
  await page.locator('.me-tpc', { hasText: '分支乙项' }).first().click({ modifiers: ['Shift'] })

  await expect(page.locator('.me-tpc.selected')).toHaveCount(2)
  await expect(page.getByRole('toolbar', { name: '主题操作' })).toContainText('已选 2 项')
})
