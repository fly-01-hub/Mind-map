import { expect, test } from './fixtures'
import { createTestPdf } from './testPdf'

test('opens a PDF, searches, changes page and restores reading progress', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc', { hasText: '子项甲三' }).first().click()
  await page.getByRole('button', { name: '节点详情' }).click()
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: 'ResearchMind Reader Test.pdf',
    mimeType: 'application/pdf',
    buffer: createTestPdf(),
  })
  await page.getByText('ResearchMind Reader Test', { exact: true }).click()

  await expect(page).toHaveURL(/\/paper\/[0-9a-f-]+/)
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.locator('.pdf-page[data-current-page="true"]')).toBeVisible()
  await expect(page.getByText('/ 2', { exact: true })).toBeVisible()

  const selectFirstPageText = async () => {
    const firstPageText = page.locator('.textLayer span', { hasText: 'ResearchMind first page' })
    await expect(firstPageText).toBeVisible()
    await firstPageText.evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })
  }
  await selectFirstPageText()
  await page.getByRole('button', { name: '高亮', exact: true }).click()
  await expect(page.locator('.paper-annotation-mark.highlight')).toHaveCount(1)
  await expect(page.locator('.paper-annotation-list article')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.locator('.paper-annotation-mark.highlight')).toHaveCount(1)

  await selectFirstPageText()
  await page.getByRole('button', { name: '下划线', exact: true }).click()
  await expect(page.locator('.paper-annotation-mark.underline')).toHaveCount(1)
  await selectFirstPageText()
  await page.getByRole('button', { name: '批注', exact: true }).click()
  await page.getByPlaceholder('记录你的理解或疑问…').fill('这是一个测试批注')
  await page.getByRole('button', { name: '保存批注' }).click()
  await expect(page.locator('.paper-annotation-mark.note')).toHaveCount(1)
  await expect(page.locator('.paper-annotation-list article')).toHaveCount(3)
  await page.getByRole('button', { name: '本页', exact: true }).click()
  await expect(page.locator('.paper-annotation-list article')).toHaveCount(3)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await page.getByRole('button', { name: '收起论文笔记' }).click()
  await expect(page.locator('.paper-sidebar')).toBeHidden()
  await page.getByRole('button', { name: '展开论文笔记' }).click()
  await expect(page.locator('.paper-sidebar')).toBeVisible()

  await page.keyboard.press('Control+f')
  const search = page.getByPlaceholder('搜索论文文字…')
  await search.fill('target phrase')
  await search.press('Enter')
  await expect(page.getByText('1 处', { exact: true })).toBeVisible()
  await expect(page.getByLabel('当前页码')).toHaveValue('2')
  await expect(page.locator('.pdf-search-hit')).toHaveCount(1)
  await page.getByRole('button', { name: '本页', exact: true }).click()
  await expect(page.getByText('当前页还没有标注。')).toBeVisible()
  await page.getByRole('button', { name: '全部', exact: true }).click()

  await page.getByRole('button', { name: '放大' }).click()
  await expect(page.getByText('130%', { exact: true })).toBeVisible()
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.locator('.pdf-page[data-current-page="true"]')).toBeVisible()
  await expect(page.getByLabel('当前页码')).toHaveValue('2')
  await expect(page.getByText('130%', { exact: true })).toBeVisible()

  await page.locator('.paper-annotation-list article').first().getByTitle('生成思维导图节点').click()
  await expect(page.getByRole('heading', { name: '生成思维导图节点' })).toBeVisible()
  await page.getByLabel('节点标题').fill('Generated Research Insight')
  await page.getByLabel('我的笔记').fill('来自论文阅读器的节点')
  await page.getByRole('button', { name: '创建节点' }).click()
  await expect(page.getByText('已创建节点“Generated Research Insight”')).toBeVisible()
  const generatedAnnotation = page.locator('.paper-annotation-list article').first()
  await expect(generatedAnnotation.getByText('关联节点：Generated Research Insight')).toBeVisible()
  await generatedAnnotation.getByRole('button', { name: '打开已生成节点 Generated Research Insight' }).click()
  await expect(page).toHaveURL(/\/map\/test-map\?nodeId=/)
  await expect(page.locator('.me-tpc', { hasText: 'Generated Research Insight' })).toBeVisible()
  await expect(page.locator('.node-inspector > header strong')).toHaveText('Generated Research Insight')

  await page.getByRole('button', { name: '打开来源 ResearchMind Reader Test 第 1 页' }).click()
  await expect(page).toHaveURL(/\/paper\/[0-9a-f-]+\?.*page=1.*annotationId=/)
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.getByLabel('当前页码')).toHaveValue('1')
  await expect(page.locator('.paper-annotation-mark.target')).toHaveCount(1)
  expect(errors).toEqual([])
})
