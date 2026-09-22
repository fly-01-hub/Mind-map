import { expect, test } from '@playwright/test'

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
  await page.getByRole('button', { name: '更多' }).click()
  await page.getByText('导入 Markdown', { exact: true }).click()

  const lines = ['# 500 节点性能验收']
  for (let branch = 0; branch < 20; branch += 1) {
    lines.push(`- 分支 ${branch + 1}`)
    for (let child = 0; child < 24; child += 1) lines.push(`  - 节点 ${branch + 1}-${child + 1}`)
  }
  await page.getByPlaceholder(/根主题/).fill(lines.join('\n'))
  const startedAt = Date.now()
  await page.getByRole('button', { name: '导入', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(501, { timeout: 15_000 })
  expect(Date.now() - startedAt).toBeLessThan(15_000)

  await page.locator('.me-tpc', { hasText: '500 节点性能验收' }).first().click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.me-tpc')).toHaveCount(502, { timeout: 3_000 })
  expect(errors).toEqual([])
})
