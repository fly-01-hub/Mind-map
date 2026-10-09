import { expect, test } from './fixtures'
import { createTestPdf } from './testPdf'

test('uploads one PDF and links it to multiple mind-map nodes without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc', { hasText: '子项甲三' }).first().click()
  await page.getByRole('button', { name: '节点详情' }).click()
  await expect(page.getByText('文献 · 0', { exact: true })).toBeVisible()

  const pdf = {
    name: 'Attention Is All You Need.pdf',
    mimeType: 'application/pdf',
    buffer: createTestPdf(),
  }
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles(pdf)
  await expect(page.getByText('Attention Is All You Need', { exact: true })).toBeVisible()
  await expect(page.getByText('文献 · 1', { exact: true })).toBeVisible()

  await page.locator('.me-tpc', { hasText: '分支丙项' }).first().click()
  await expect(page.getByText('文献 · 0', { exact: true })).toBeVisible()
  await page.getByLabel('选择已有论文').selectOption({ label: 'Attention Is All You Need' })
  await page.getByRole('button', { name: '关联', exact: true }).click()
  await expect(page.getByText('文献 · 1', { exact: true })).toBeVisible()

  await page.reload()
  await page.locator('.me-tpc', { hasText: '分支丙项' }).first().click()
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await page.locator('.embedded-reader').getByRole('button', { name: '返回思维导图', exact: true }).click()
  await page.getByRole('button', { name: '节点详情' }).click()
  await expect(page.getByText('Attention Is All You Need', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('creates a visible paper node when a PDF is dropped onto a topic', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const target = page.locator('.me-tpc', { hasText: '子项甲三' }).first()
  await expect(target).toBeVisible()
  const bytes = Array.from(createTestPdf())

  await target.evaluate((element, pdfBytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(pdfBytes)], 'Dropped Research Paper.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, bytes)

  await expect(page.locator('.me-tpc', { hasText: 'Dropped Research Paper' })).toBeVisible()
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.embedded-reader .paper-reader-title strong')).toHaveText('Dropped Research Paper')
})
