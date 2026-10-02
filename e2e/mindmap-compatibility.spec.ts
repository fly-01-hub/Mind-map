import { expect, test } from '@playwright/test'

async function openMap(page: import('@playwright/test').Page) {
  await page.goto('/map/research-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(11)
}

test('applies Mubu-style task and topic formatting shortcuts in the map', async ({ page }) => {
  await openMap(page)
  const topic = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  await topic.click()

  await page.keyboard.press('Control+Shift+L')
  await expect(topic).toContainText('☐')
  await page.keyboard.press('Control+Shift+K')
  await expect(topic).toContainText('☑')

  await page.keyboard.press('Control+B')
  await expect(topic).toHaveCSS('font-weight', '700')
  await page.keyboard.press('Control+I')
  await expect(topic).toHaveCSS('font-style', 'italic')
  await page.keyboard.press('Alt+R')
  await expect(topic).toHaveCSS('color', 'rgb(178, 71, 62)')
})

test('supports keyboard range selection and batch deletion in the map', async ({ page }) => {
  await openMap(page)
  const topic = page.locator('.me-tpc', { hasText: '相机模型' }).first()
  await topic.click()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByRole('toolbar', { name: '主题操作' })).toContainText('已选 2 项')

  const before = await page.locator('.me-tpc').count()
  await page.keyboard.press('Delete')
  await expect(page.locator('.me-tpc')).toHaveCount(before - 2)
})

test('pans the whole map with the middle mouse button', async ({ page }) => {
  await openMap(page)
  const root = page.locator('.me-root .me-tpc').first()
  const stage = page.locator('.mindmap-stage')
  const before = await root.boundingBox()
  const stageBox = await stage.boundingBox()
  expect(before).not.toBeNull()
  expect(stageBox).not.toBeNull()

  await page.mouse.move(stageBox!.x + 45, stageBox!.y + 90)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(stageBox!.x + 165, stageBox!.y + 150, { steps: 8 })
  await page.mouse.up({ button: 'middle' })

  const after = await root.boundingBox()
  expect(after).not.toBeNull()
  expect(after!.x - before!.x).toBeGreaterThan(90)
  expect(after!.y - before!.y).toBeGreaterThan(35)
})

test('moves and deletes multiple selected map topics as one group', async ({ page }) => {
  await openMap(page)
  const first = page.locator('.me-tpc', { hasText: '相机模型' }).first()
  const second = page.locator('.me-tpc', { hasText: '柱状投影' }).first()
  const target = page.locator('.me-tpc', { hasText: '深度学习' }).first()

  await first.click()
  await second.click({ modifiers: ['Shift'] })
  await expect(page.getByRole('toolbar', { name: '主题操作' })).toContainText('已选 2 项')
  await page.getByRole('button', { name: '移动到', exact: true }).click()
  await page.getByRole('button', { name: '移动到 深度学习' }).click()

  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  const targetBox = await target.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  expect(firstBox!.x).toBeGreaterThan(targetBox!.x + 70)
  expect(secondBox!.x).toBeGreaterThan(targetBox!.x + 70)

  await page.getByRole('button', { name: '删除已选 2 个主题' }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(9)
})

test('drags multiple selected map topics together', async ({ page }) => {
  await openMap(page)
  const first = page.locator('.me-tpc', { hasText: '相机模型' }).first()
  const second = page.locator('.me-tpc', { hasText: '柱状投影' }).first()
  const target = page.locator('.me-tpc', { hasText: '深度学习' }).first()

  await first.click()
  await second.click({ modifiers: ['Shift'] })
  const from = await first.boundingBox()
  const destination = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(destination).not.toBeNull()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination!.x + destination!.width * .8, destination!.y + destination!.height / 2, { steps: 18 })
  await page.waitForTimeout(250)
  await page.mouse.up()

  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  const targetBox = await target.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  expect(firstBox!.x).toBeGreaterThan(targetBox!.x + 70)
  expect(secondBox!.x).toBeGreaterThan(targetBox!.x + 70)
})

test('creates summaries and relations directly from map selections', async ({ page }) => {
  await openMap(page)
  const first = page.locator('.me-tpc', { hasText: '相机模型' }).first()
  const second = page.locator('.me-tpc', { hasText: '柱状投影' }).first()

  await first.click()
  await second.click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '概要', exact: true }).click()
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)

  await first.click()
  await page.getByRole('button', { name: '连接', exact: true }).click()
  await expect(page.locator('.relation-mode-hint')).toContainText('请选择另一个主题')
  await page.locator('.me-tpc', { hasText: '激光雷达' }).first().click()
  await expect(page.locator('.topiclinks [data-linkid]')).toHaveCount(1)
  await expect(page.locator('.relation-mode-hint')).toHaveCount(0)
})

test('search reveals a map topic without entering an isolated branch', async ({ page }) => {
  await openMap(page)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.getByPlaceholder('搜索节点、标签或笔记…').fill('Transformer')
  await page.getByRole('button', { name: /Transformer/ }).click()

  await expect(page.locator('.focus-breadcrumb')).toHaveCount(0)
  await expect(page.locator('.me-tpc')).toHaveCount(11)
  await expect(page.locator('.me-tpc', { hasText: 'Transformer' }).first()).toHaveClass(/selected/)
})

test('read-only and presentation modes block structural keyboard edits', async ({ page }) => {
  await openMap(page)
  const topic = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  await topic.click()
  const before = await page.locator('.me-tpc').count()

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitemcheckbox', { name: '只读浏览' }).click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.me-tpc')).toHaveCount(before)
  await expect(page.getByRole('button', { name: '新增子主题' })).toBeDisabled()
  await expect(page.getByRole('toolbar', { name: '主题操作' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '节点详情' })).toBeDisabled()

  await page.keyboard.press('Control+Alt+Shift+P')
  await expect(page.getByRole('button', { name: '退出演示' })).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(page.locator('.me-tpc')).toHaveCount(before)
})

test('keeps the center topic and document title synchronized', async ({ page }) => {
  await openMap(page)
  const root = page.locator('.me-root .me-tpc').first()
  await root.dblclick()
  const editor = page.locator('#input-box[contenteditable]')
  await editor.press('Control+A')
  await editor.pressSequentially('新的中心主题')
  await editor.press('Escape')
  await expect(page.getByRole('textbox', { name: '文档名称' })).toHaveValue('新的中心主题')
})

test('adds an image to a map topic through the Mubu shortcut', async ({ page }) => {
  await openMap(page)
  const topic = page.locator('.me-tpc', { hasText: '鱼眼视觉' }).first()
  await topic.click()

  const chooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Alt+Enter')
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'topic.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })

  await expect(topic.locator('img')).toHaveCount(1)
})
