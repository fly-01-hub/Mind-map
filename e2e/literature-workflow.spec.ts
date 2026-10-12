import { expect, test, type Page } from './fixtures'
import { createTestPdf } from './testPdf'

async function dropPdf(page: Page, title = 'Literature', target = '子项甲三', bytes = createTestPdf()) {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const topic = page.locator('.me-tpc', { hasText: target }).first()
  await expect(topic).toBeVisible()
  await topic.evaluate((node, value) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(value.bytes)], `${value.title}.pdf`, { type: 'application/pdf' }))
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, { bytes: Array.from(bytes), title })
  await expect(page.locator('.embedded-reader .pdf-page-shell')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
}

async function selectText(page: Page, text = 'ResearchMind first page') {
  const span = page.locator('.embedded-reader .textLayer span', { hasText: text }).first()
  await span.evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
}

test('dropping literature opens PDF left, map right; only double click reopens the paper', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await dropPdf(page)
  const pdf = (await page.locator('.map-paper-pane').boundingBox())!
  const map = (await page.locator('.mindmap-stage').boundingBox())!
  expect(pdf.x + pdf.width).toBeLessThanOrEqual(map.x + 1)
  await page.locator('.embedded-reader').getByRole('button', { name: '返回思维导图' }).click()
  await expect(page.locator('.embedded-reader')).toHaveCount(0)
  await page.locator('.me-tpc', { hasText: 'Literature' }).first().click()
  // Wait beyond the former delayed single-click action.
  await page.waitForTimeout(650)
  await expect(page.locator('.embedded-reader')).toHaveCount(0)
  await expect(page.locator('.me-tpc', { hasText: 'Literature' }).first()).toHaveClass(/selected/)
  await page.locator('.me-tpc', { hasText: 'Literature' }).first().dblclick({ delay: 100 })
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('#input-box[contenteditable]')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/literature-split.png', fullPage: true })
  await page.reload()
  await page.locator('.me-tpc', { hasText: 'Literature' }).first().dblclick()
  await expect(page.locator('.embedded-reader .pdf-page-shell')).toHaveAttribute('aria-busy', 'false')
  expect(errors).toEqual([])
})

test('highlight, underline and note automatically create sibling evidence under the literature node', async ({ page }) => {
  await dropPdf(page)
  const literature = page.locator('.me-tpc', { hasText: 'Literature' }).first()
  // Selection elsewhere must not change where new evidence is inserted.
  await page.locator('.me-tpc', { hasText: '分支甲项' }).first().click()
  await selectText(page)
  await page.getByRole('button', { name: '高亮', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(1)
  await selectText(page)
  await page.getByRole('button', { name: '下划线', exact: true }).click()
  const underline = page.locator('.paper-annotation-mark.underline.target')
  await expect(underline).toHaveCount(1)
  expect(await underline.evaluate((node) => ({ outline: getComputedStyle(node).outlineStyle, border: getComputedStyle(node).borderBottomWidth, background: getComputedStyle(node).backgroundColor })))
    .toEqual({ outline: 'none', border: '1px', background: 'rgba(0, 0, 0, 0)' })
  await selectText(page)
  await page.getByRole('button', { name: '批注', exact: true }).click()
  await page.getByPlaceholder('记录你的理解或疑问…').fill('My interpretation')
  await page.getByRole('button', { name: '保存批注' }).click()
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(3)
  await expect(page.locator('.me-tpc.selected')).toHaveCount(1)
  await expect(literature).toBeVisible()
  const durableChildren = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts' as string)
    const saved = await appDatabase.documents.get('test-map')
    const find = (node: { title: string; children: typeof node[] }): typeof node | undefined => node.title === 'Literature' ? node : node.children.map(find).find(Boolean)
    return find(saved.root)?.children.map((node) => node.title)
  })
  expect(durableChildren).toEqual(['ResearchMind first page', 'ResearchMind first page', 'ResearchMind first page'])
  await page.screenshot({ path: 'test-results/literature-underline.png', fullPage: true })
  await page.reload()
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(3)
})

test('continuous highlighting creates evidence without an extra dialog and supports undo/redo', async ({ page }) => {
  await dropPdf(page)
  await page.getByRole('combobox', { name: '划选标注模式' }).selectOption('highlight')
  await selectText(page)
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.annotation-toolbar')).toHaveCount(0)
  await page.locator('.canvas-controls').getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(0)
  await page.locator('.canvas-controls').getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(1)
  await page.locator('.embedded-reader').getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('.pdf-page-shell')).toHaveAttribute('aria-busy', 'false')
  await selectText(page, 'Second-page target phrase')
  await expect(page.locator('.me-tpc', { hasText: 'Second-page target phrase' })).toHaveCount(1)
})

test('area highlights create one illustrated child, and reselecting does not duplicate it', async ({ page }) => {
  await dropPdf(page)
  const reader = page.locator('.embedded-reader')
  await reader.getByRole('button', { name: '区域批注', exact: true }).click()
  const bounds = (await reader.locator('.pdf-area-selector').boundingBox())!
  await page.mouse.move(bounds.x + 30, bounds.y + 50); await page.mouse.down()
  await page.mouse.move(bounds.x + 170, bounds.y + 130, { steps: 5 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存区域', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: '第 1 页区域批注' })).toHaveCount(1)
  await reader.getByRole('button', { name: '展开论文笔记' }).click()
  await reader.getByRole('button', { name: '重新框选区域' }).click()
  await page.mouse.move(bounds.x + 60, bounds.y + 60); await page.mouse.down()
  await page.mouse.move(bounds.x + 150, bounds.y + 110, { steps: 5 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存区域', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: '第 1 页区域批注' })).toHaveCount(1)
  await expect(reader.locator('.paper-annotation-mark.area')).toHaveCount(1)
})

test('a corrupt dropped PDF leaves no empty paper node', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.me-tpc', { hasText: '子项甲三' }).first().evaluate((node) => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['not a PDF'], 'Broken.pdf', { type: 'application/pdf' }))
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })
  await expect(page.locator('.me-tpc', { hasText: 'Broken' })).toHaveCount(0)
  await expect(page.locator('.embedded-reader')).toHaveCount(0)
})

test('multi-line partial underlines create only text-sized lines, not whole span boxes', async ({ page }) => {
  const bytes = createTestPdf('BT /F1 18 Tf 72 720 Td (First selected line here) Tj 0 -30 Td (Second selected line here) Tj ET')
  await dropPdf(page, 'Multiline', '子项甲三', bytes)
  const layer = page.locator('.embedded-reader .textLayer')
  await layer.evaluate((node) => {
    const spans = node.querySelectorAll('span')
    const range = document.createRange()
    range.setStart(spans[0].firstChild!, 6); range.setEnd(spans[1].firstChild!, 15)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await page.getByRole('button', { name: '下划线', exact: true }).click()
  const marks = page.locator('.paper-annotation-mark.underline')
  await expect(marks).toHaveCount(2)
  const geometry = await marks.evaluateAll((nodes) => nodes.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, outline: getComputedStyle(node).outlineStyle })))
  expect(geometry.every((rect) => rect.height < 30 && rect.width < 230 && rect.outline === 'none')).toBe(true)
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.locator('.embedded-reader').getByRole('button', { name: '适应阅读宽度', exact: true }).click()
  await expect(marks).toHaveCount(2)
  await page.screenshot({ path: 'test-results/literature-multiline.png', fullPage: true })
})

test('rectangle highlight fills the entire region, extracts its text and survives resize/reload/reselection', async ({ page }) => {
  await dropPdf(page)
  const reader = page.locator('.embedded-reader')
  await reader.getByRole('button', { name: '矩形高亮', exact: true }).click()
  const span = (await reader.locator('.textLayer span', { hasText: 'ResearchMind first page' }).boundingBox())!
  await page.mouse.move(span.x - 5, span.y - 5); await page.mouse.down()
  await page.mouse.move(span.x + span.width + 6, span.y + span.height + 30, { steps: 6 }); await page.mouse.up()
  await expect(page.locator('.pdf-area-selector')).toBeVisible()
  await page.getByRole('button', { name: '选择green颜色' }).click()
  await page.getByRole('button', { name: '保存区域高亮', exact: true }).click()
  const mark = reader.locator('.paper-annotation-mark.region-highlight')
  await expect(mark).toHaveCount(1)
  await expect(mark).toHaveAttribute('data-color', 'green')
  expect(await mark.evaluate((node) => ({ border: getComputedStyle(node).borderTopWidth, outline: getComputedStyle(node).outlineStyle, fill: getComputedStyle(node).backgroundColor })))
    .toEqual({ border: '0px', outline: 'none', fill: 'rgba(137, 204, 153, 0.27)' })
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(1)
  await expect(reader.locator('.pdf-area-selector')).toHaveCount(0)
  await reader.getByRole('button', { name: '展开论文笔记' }).click()
  await reader.getByRole('button', { name: '重新框选区域' }).click()
  const bounds = (await reader.locator('.pdf-area-selector').boundingBox())!
  await page.mouse.move(bounds.x + 45, bounds.y + 60); await page.mouse.down()
  await page.mouse.move(bounds.x + 180, bounds.y + 150, { steps: 4 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存区域高亮', exact: true }).click()
  await expect(mark).toHaveCount(1)
  await expect(page.locator('.me-tpc', { hasText: 'ResearchMind first page' })).toHaveCount(1)
  await reader.getByRole('button', { name: '放大', exact: true }).click()
  await expect(reader.locator('.pdf-page-shell')).toHaveAttribute('aria-busy', 'false')
  await expect(mark).toHaveCount(1)
  await page.screenshot({ path: 'test-results/rectangle-highlight.png', fullPage: true })
  await page.reload()
  await page.locator('.me-tpc', { hasText: 'Literature' }).first().dblclick()
  await expect(mark).toHaveCount(1)
  await expect(mark).toHaveAttribute('data-color', 'green')
})

test('rectangle highlight works without a text layer and Escape cancels without saving', async ({ page }) => {
  await dropPdf(page, 'Scanned', '子项甲三', createTestPdf('0.8 0.8 0.8 rg 72 650 240 70 re f'))
  const reader = page.locator('.embedded-reader')
  await reader.getByRole('button', { name: '矩形高亮', exact: true }).click()
  let bounds = (await reader.locator('.pdf-area-selector').boundingBox())!
  await page.mouse.move(bounds.x + 30, bounds.y + 40); await page.mouse.down()
  await page.mouse.move(bounds.x + 180, bounds.y + 120, { steps: 5 }); await page.mouse.up()
  await page.keyboard.press('Escape')
  await expect(reader.locator('.pdf-area-selector')).toHaveCount(0)
  await expect(reader.locator('.region-highlight')).toHaveCount(0)
  await reader.getByRole('button', { name: '矩形高亮', exact: true }).click()
  bounds = (await reader.locator('.pdf-area-selector').boundingBox())!
  // Reverse-direction drag is supported too.
  await page.mouse.move(bounds.x + 180, bounds.y + 120); await page.mouse.down()
  await page.mouse.move(bounds.x + 30, bounds.y + 40, { steps: 5 }); await page.mouse.up()
  await page.getByRole('button', { name: '保存区域高亮', exact: true }).click()
  await expect(reader.locator('.region-highlight')).toHaveCount(1)
  await expect(page.locator('.me-tpc', { hasText: '第 1 页区域高亮' })).toHaveCount(1)
})

test('legacy oversize fragmented boxes are reanchored to exact text without rewriting stored data', async ({ page }) => {
  await dropPdf(page)
  await selectText(page)
  await page.getByRole('button', { name: '高亮', exact: true }).click()
  const legacy = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts' as string)
    const annotation = (await appDatabase.paperAnnotations.toArray())[0]
    const rect = annotation.positionData.rects[0]
    const positionData = { ...annotation.positionData, rects: [{ ...rect, width: .85 }, { ...rect, x: rect.x + .04, width: .8 }] }
    await appDatabase.paperAnnotations.update(annotation.id, { positionData })
    return { id: annotation.id, positionData }
  })
  await page.reload()
  await page.locator('.me-tpc', { hasText: 'Literature' }).first().dblclick()
  await expect(page.locator('.embedded-reader .pdf-page-shell')).toHaveAttribute('aria-busy', 'false')
  const mark = page.locator('.paper-annotation-mark.highlight')
  await expect(mark).toHaveCount(1)
  const textBounds = (await page.locator('.embedded-reader .textLayer span', { hasText: 'ResearchMind first page' }).boundingBox())!
  const bounds = (await mark.boundingBox())!
  expect(Math.abs(bounds.width - textBounds.width)).toBeLessThan(2)
  expect(await mark.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none')
  await page.locator('.embedded-reader').getByRole('button', { name: '放大', exact: true }).click()
  await expect(page.locator('.embedded-reader .pdf-page-shell')).toHaveAttribute('aria-busy', 'false')
  await expect(mark).toHaveCount(1)
  expect(await page.evaluate(async (id) => {
    const { appDatabase } = await import('/src/db/appDatabase.ts' as string)
    return (await appDatabase.paperAnnotations.get(id)).positionData
  }, legacy.id)).toEqual(legacy.positionData)
  await page.screenshot({ path: 'test-results/refined-highlight.png', fullPage: true })
})

test('identical quotations stay anchored to the selected occurrence after reload', async ({ page }) => {
  await dropPdf(page, 'Repeated', '子项甲三', createTestPdf('BT /F1 18 Tf 72 720 Td (Repeat phrase) Tj 0 -60 Td (Repeat phrase) Tj ET'))
  await page.locator('.embedded-reader .textLayer span', { hasText: 'Repeat phrase' }).nth(1).evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await page.getByRole('button', { name: '高亮', exact: true }).click()
  await page.reload()
  await page.locator('.me-tpc', { hasText: 'Repeated' }).first().dblclick()
  const mark = page.locator('.paper-annotation-mark.highlight')
  await expect(mark).toHaveCount(1)
  const second = (await page.locator('.embedded-reader .textLayer span', { hasText: 'Repeat phrase' }).nth(1).boundingBox())!
  expect(Math.abs((await mark.boundingBox())!.y - second.y)).toBeLessThan(second.height * .15)
})
