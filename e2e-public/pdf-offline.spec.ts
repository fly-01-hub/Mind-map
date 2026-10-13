import { expect, test, type Page } from '@playwright/test'
import { createTestPdf } from '../e2e/testPdf'

async function waitForOfflineInstallation(page: Page) {
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '新建思维导图', exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
}

test('production PWA precaches the PDF worker before any PDF is opened', async ({ page }) => {
  await waitForOfflineInstallation(page)
  const cachedWorkers = await page.evaluate(async () => {
    const urls = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        if (/\/pdf\.worker\.min-[^/]+\.mjs$/.test(new URL(request.url).pathname)) urls.push(request.url)
      }
    }
    return urls
  })
  expect(cachedWorkers).toHaveLength(1)
})

test('first PDF drop, reading and reopening work offline in the production PWA', async ({ page, context }) => {
  const errors: string[] = []
  const dialogs: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss() })
  await waitForOfflineInstallation(page)
  await page.getByRole('button', { name: '新建思维导图', exact: true }).click()
  await page.getByLabel('文档名称', { exact: true }).fill('Offline PDF import')
  await page.getByLabel('文档名称', { exact: true }).press('Enter')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc').first()).toBeVisible()
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()

  // No PDF has been opened yet. Only the installed PWA precache can serve its worker.
  await context.setOffline(true)
  await page.locator('.me-tpc').first().evaluate((element, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'Offline Paper.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, Array.from(createTestPdf()))
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()
  await expect(page.getByText('/ 2', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.me-tpc', { hasText: 'Offline Paper' })).toBeVisible()
  await page.locator('.me-tpc', { hasText: 'Offline Paper' }).first().dblclick()
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 })
  await expect(page.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()
  expect(dialogs).toEqual([])
  expect(errors).toEqual([])
})
