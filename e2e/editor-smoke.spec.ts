import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('creates a complete local backup from the library', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'showSaveFilePicker') })
  await page.goto('/library')
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await expect(page.getByRole('heading', { name: '备份与恢复' })).toBeVisible()
  await expect(page.getByText('备份文件包含导图、历史版本、附件、PDF、批注和阅读进度。')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /创建完整备份/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^ResearchMind-backup-.+\.researchmind$/)
  expect(await download.failure()).toBeNull()
  await expect(page.getByRole('status')).toContainText('备份已保存')
})

test('switches library layouts and exposes the canvas operation guide', async ({ page }) => {
  await page.goto('/library')
  await page.getByRole('button', { name: '卡片视图' }).click()
  await expect(page.locator('.document-card')).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.document-card')).toHaveCount(3)
  await page.getByRole('button', { name: '列表视图' }).click()
  await expect(page.locator('.document-row')).toHaveCount(3)

  await page.getByText('自动驾驶感知研究', { exact: true }).click()
  await page.getByRole('button', { name: '操作指南' }).click()
  await expect(page.getByRole('heading', { name: '操作指南与快捷键' })).toBeVisible()
  await expect(page.getByText('大纲优先')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByRole('button', { name: '放大' }).click()
  await expect(page.locator('.canvas-scale')).toHaveText('110%')
})

test('library opens a right-facing editable map without console errors', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.stack ?? error.message))

  await page.goto('/library')
  await expect(page.getByRole('heading', { name: '全部文档' })).toBeVisible()
  const folderRow = page.getByRole('button', { name: '科研资料 2' })
  const folderBox = await folderRow.boundingBox()
  expect(folderBox).not.toBeNull()
  expect(folderBox!.width).toBeGreaterThan(120)
  expect(folderBox!.height).toBeLessThan(40)
  await page.getByText('自动驾驶感知研究', { exact: true }).click()
  await expect(page).toHaveURL(/\/map\/research-map/)
  await page.getByRole('button', { name: '导图', exact: true }).click()

  const topics = page.locator('.me-tpc')
  await expect(topics).toHaveCount(11)
  const root = page.locator('.me-tpc', { hasText: '研究方向' }).first()
  const child = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  const rootBox = await root.boundingBox()
  const childBox = await child.boundingBox()
  expect(rootBox).not.toBeNull()
  expect(childBox).not.toBeNull()
  expect(childBox!.x).toBeGreaterThan(rootBox!.x)

  await child.hover()
  await expect(page.getByRole('button', { name: '折叠下级' })).toBeVisible()
  await page.getByRole('button', { name: '折叠下级' }).click()
  await expect(topics).toHaveCount(8)
  await page.getByRole('button', { name: '展开下级' }).click()
  await expect(topics).toHaveCount(11)

  await child.click()
  await expect(page.locator('.mindmap-stage')).toBeFocused()
  await expect(child).toHaveClass(/selected/)
  await expect(page.getByRole('button', { name: '添加子主题' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(topics).toHaveCount(12)
  await expect(page.locator('#input-box[contenteditable]')).toBeVisible()

  const editor = page.locator('#input-box[contenteditable]')
  const countBeforeComposition = await topics.count()
  await editor.dispatchEvent('compositionstart')
  await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await editor.dispatchEvent('compositionend')
  await expect(topics).toHaveCount(countBeforeComposition)

  await editor.press('Control+A')
  await editor.pressSequentially('中文节点')
  await editor.press('Enter')
  await expect(topics).toHaveCount(13)

  await page.locator('.me-tpc', { hasText: 'BEV' }).first().click({ button: 'right' })
  await expect(page.getByText('插入下级主题', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+]')
  await expect(page.locator('.focus-breadcrumb')).toContainText('研究方向')
  await expect(topics).toHaveCount(1)
  await page.locator('.focus-breadcrumb button').first().click()
  await expect(topics).toHaveCount(13)

  expect(consoleErrors).toEqual([])
})

test('dragging reparents a complete subtree', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const fish = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  const deep = page.locator('.me-tpc', { hasText: '深度学习' }).first()
  await expect(fish).toBeVisible()

  const from = await fish.boundingBox()
  const destination = await deep.boundingBox()
  expect(from).not.toBeNull()
  expect(destination).not.toBeNull()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination!.x + destination!.width * .8, destination!.y + destination!.height / 2, { steps: 18 })
  await page.waitForTimeout(250)
  await page.mouse.up()

  await expect(page.locator('.me-tpc')).toHaveCount(11)
  const movedFish = await fish.boundingBox()
  const movedDeep = await deep.boundingBox()
  expect(movedFish).not.toBeNull()
  expect(movedDeep).not.toBeNull()
  expect(movedFish!.x).toBeGreaterThan(movedDeep!.x + 70)
  expect(pageErrors).toEqual([])
})

test('creates a document, edits children, and restores them after refresh', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/library')
  await page.getByRole('button', { name: '新建思维导图' }).click()
  await expect(page).toHaveURL(/\/map\/[0-9a-f-]+/)
  await page.getByRole('button', { name: '导图', exact: true }).click()

  const topics = page.locator('.me-tpc')
  await expect(topics).toHaveCount(1)
  await topics.first().click()
  await page.keyboard.press('Tab')
  const editor = page.locator('#input-box[contenteditable]')
  await expect(editor).toBeVisible()
  await editor.press('Control+A')
  await editor.pressSequentially('持久化子节点')
  await editor.press('Enter')
  await expect(topics).toHaveCount(3)
  await editor.pressSequentially('刷新后仍存在')
  await editor.press('Escape')
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('.me-tpc', { hasText: '持久化子节点' })).toBeVisible()
  await expect(page.locator('.me-tpc', { hasText: '刷新后仍存在' })).toBeVisible()
  expect(errors).toEqual([])
})

test('exports the complete map as a PNG download', async ({ page }) => {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(11)
  await page.getByRole('button', { name: '更多' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByText('导出 2× PNG', { exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('自动驾驶感知研究.png')
  expect(await download.failure()).toBeNull()
})

test('imports and remains editable with 500 nodes', async ({ page }) => {
  test.setTimeout(45_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '导入文件' }).click()

  const lines = ['# 500 节点性能验收']
  for (let branch = 0; branch < 20; branch += 1) {
    lines.push(`- 分支 ${branch + 1}`)
    for (let child = 0; child < 24; child += 1) lines.push(`  - 节点 ${branch + 1}-${child + 1}`)
  }
  await page.getByPlaceholder(/根主题/).fill(lines.join('\n'))
  const startedAt = Date.now()
  await page.getByRole('button', { name: '导入 Markdown', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(501, { timeout: 15_000 })
  expect(Date.now() - startedAt).toBeLessThan(15_000)

  await page.locator('.me-tpc', { hasText: '500 节点性能验收' }).first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.me-tpc')).toHaveCount(502, { timeout: 3_000 })
  expect(errors).toEqual([])
})

test('edits structure continuously in the outline-first view', async ({ page }) => {
  await page.goto('/map/research-map')
  await expect(page.getByRole('button', { name: '大纲' })).toHaveClass(/active/)
  await expect(page.locator('.outline-row')).toHaveCount(10)

  const topic = page.locator('.outline-topic-input').first()
  await topic.click()
  await topic.press('End')
  await topic.press('Enter')
  const created = page.locator('.outline-topic-input:focus')
  await expect(created).toHaveText('')
  await created.fill('新建的同级主题')
  await created.press('Tab')
  await expect(page.locator('.outline-row')).toHaveCount(11)

  await created.evaluate((element) => {
    const text = element.firstChild
    if (!text) throw new Error('Expected an editable text node')
    const range = document.createRange()
    range.setStart(text, 3)
    range.setEnd(text, 6)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await created.press('Backspace')
  await expect(created).toHaveText('新建的题')

  await created.evaluate((element) => {
    const text = element.firstChild
    if (!text) throw new Error('Expected an editable text node')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  await expect(created.locator('b, strong')).toHaveText('新建')
  await created.press('Shift+Tab')

  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(12)
  await expect(page.locator('.me-tpc', { hasText: '新建的题' })).toBeVisible()
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(page.locator('.outline-topic-input', { hasText: '新建的题' }).locator('strong')).toHaveText('新建')
})

test('selects a range of outline topics and applies one atomic bulk action', async ({ page }) => {
  await page.goto('/map/research-map')
  const leafBullets = page.locator('.outline-bullet:not(.has-children)')
  await leafBullets.nth(0).click()
  await leafBullets.nth(2).click({ modifiers: ['Control'] })

  await expect(page.locator('.outline-row.is-selected')).toHaveCount(2)
  await expect(page.getByRole('toolbar', { name: '批量操作' })).toContainText('已选 2 项')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('.outline-row.is-selected .outline-task.task-done')).toHaveCount(2)

  const before = await page.locator('.outline-row').count()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.outline-row')).toHaveCount(before - 2)
  await expect(page.getByRole('toolbar', { name: '批量操作' })).toHaveCount(0)
})

test('creates and persists a cross-topic relation in the mind-map view', async ({ page }) => {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const first = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  await first.click()
  await expect(page.getByRole('button', { name: '创建关联线' })).toBeVisible()
  await page.getByRole('button', { name: '创建关联线' }).click()
  await page.getByRole('button', { name: '关联到 激光雷达' }).click()
  await expect(page.locator('.topiclinks [data-linkid]')).toHaveCount(1)

  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.topiclinks [data-linkid]')).toHaveCount(1)
})

test('creates a persistent summary from adjacent outline topics', async ({ page }) => {
  await page.goto('/map/research-map')
  const firstRow = page.locator('.outline-row', { has: page.locator('.outline-topic-input', { hasText: '相机模型' }) })
  const secondRow = page.locator('.outline-row', { has: page.locator('.outline-topic-input', { hasText: '柱状投影' }) })
  await firstRow.locator('.outline-bullet').click()
  await secondRow.locator('.outline-bullet').click({ modifiers: ['Control'] })
  await page.getByRole('button', { name: '概要', exact: true }).click()

  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)
})

test('persists map appearance and offers a distraction-free presentation mode', async ({ page }) => {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitemradio', { name: '海洋蓝' }).click()
  await expect(page.locator('.me-root .me-tpc').first()).toHaveCSS('background-color', 'rgb(40, 86, 107)')

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '演示模式' }).click()
  await expect(page.getByRole('button', { name: '退出演示' })).toBeVisible()
  await expect(page.locator('.editor-toolbar')).toBeHidden()
  await page.getByRole('button', { name: '退出演示' }).click()
  await expect(page.locator('.editor-toolbar')).toBeVisible()

  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-root .me-tpc').first()).toHaveCSS('background-color', 'rgb(40, 86, 107)')
})

test('round-trips a local XMind file without an online converter', async ({ page }) => {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '更多' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: '导出 XMind' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.xmind$/)
  const filePath = await download.path()
  expect(filePath).toBeTruthy()

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '导入文件' }).click()
  await page.locator('input[type="file"][accept*="xmind"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/x-xmind',
    buffer: await readFile(filePath!),
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.outline-row')).toHaveCount(10)
})

test('round-trips OPML and edits a structured table locally', async ({ page }) => {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '更多' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: '导出 OPML' }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  expect(filePath).toBeTruthy()

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '导入文件' }).click()
  await page.locator('input[type="file"][accept*="opml"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'text/x-opml',
    buffer: await readFile(filePath!),
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.outline-row')).toHaveCount(10)

  await page.locator('.outline-topic-input').first().click()
  await page.getByRole('button', { name: '节点详情' }).click()
  await page.getByLabel('表格').fill('方法\t结果\n方案 A\t92%')
  await page.getByText('节点颜色').click()
  await expect(page.locator('.node-table-preview')).toContainText('方案 A')
  await expect(page.locator('.outline-node-meta')).toContainText('表格 1')
})
