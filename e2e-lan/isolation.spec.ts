import { expect, test, type Page } from '@playwright/test'
import { createTestPdf } from '../e2e/testPdf'

async function prepare(page: Page) {
  await page.goto('/library')
  await expect(page.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('two browser profiles share only program files; documents and PDFs stay separate and survive reopening', async ({ browser, baseURL }) => {
  const first = await browser.newContext({ baseURL })
  const second = await browser.newContext({ baseURL })
  try {
    const a = await first.newPage(), b = await second.newPage()
    await prepare(a)
    await prepare(b)
    await a.getByRole('button', { name: '新建思维导图', exact: true }).click()
    await a.getByLabel('文档名称', { exact: true }).fill('Browser A private document')
    await a.getByLabel('文档名称', { exact: true }).press('Enter')
    await a.getByRole('button', { name: '导图', exact: true }).click()
    await expect(a.getByText('已保存到本地', { exact: true })).toBeVisible()
    await a.locator('.me-tpc').first().evaluate((element, bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], 'Browser A Private Paper.pdf', { type: 'application/pdf' }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    }, Array.from(createTestPdf()))
    await expect(a.locator('.embedded-reader')).toBeVisible()
    await expect(a.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()
    await a.reload()
    await a.locator('.me-tpc', { hasText: 'Browser A Private Paper' }).first().click()
    await expect(a.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()

    // Same origin, different profiles: no document, PDF, attachment or history leaks.
    await b.reload()
    await expect(b.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
    const emptyCounts = await b.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zhijian-knowledge-db')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        return await Promise.all(Array.from(db.objectStoreNames).filter((name) => name !== 'meta').map((name) => new Promise<number>((resolve, reject) => {
          const request = db.transaction(name, 'readonly').objectStore(name).count()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })))
      } finally { db.close() }
    })
    expect(emptyCounts.every((count) => count === 0)).toBe(true)
    await b.getByRole('button', { name: '新建思维导图', exact: true }).click()
    await b.getByLabel('文档名称', { exact: true }).fill('Browser B private document')
    await b.getByLabel('文档名称', { exact: true }).press('Enter')
    await expect(b.getByText('已保存到本地', { exact: true })).toBeVisible()
    await b.getByRole('button', { name: '返回知识库', exact: true }).click()
    await b.reload()
    await expect(b.getByText('Browser B private document', { exact: true })).toBeVisible()
    await expect(b.getByText('Browser A private document', { exact: true })).toHaveCount(0)
    await a.getByRole('button', { name: '返回知识库', exact: true }).click()
    await expect(a.getByText('Browser A private document', { exact: true })).toBeVisible()
    await expect(a.getByText('Browser B private document', { exact: true })).toHaveCount(0)
  } finally { await first.close(); await second.close() }
})

test('the shared program retains offline first-time PDF importing', async ({ page, context }) => {
  await prepare(page)
  await page.getByRole('button', { name: '新建思维导图', exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.locator('.me-tpc').first().evaluate((element, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'Offline LAN Paper.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, Array.from(createTestPdf()))
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()
})
