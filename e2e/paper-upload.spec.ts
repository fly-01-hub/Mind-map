import { expect, test } from '@playwright/test'
import { createTestPdf } from './testPdf'

test('uploads one PDF and links it to multiple mind-map nodes without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/map/research-map')
  await page.locator('.me-tpc', { hasText: 'BEV' }).first().click()
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

  await page.locator('.me-tpc', { hasText: '深度学习' }).first().click()
  await expect(page.getByText('文献 · 0', { exact: true })).toBeVisible()
  await page.getByLabel('选择已有论文').selectOption({ label: 'Attention Is All You Need' })
  await page.getByRole('button', { name: '关联', exact: true }).click()
  await expect(page.getByText('文献 · 1', { exact: true })).toBeVisible()

  await page.reload()
  await page.locator('.me-tpc', { hasText: '深度学习' }).first().click()
  await page.getByRole('button', { name: '节点详情' }).click()
  await expect(page.getByText('Attention Is All You Need', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
