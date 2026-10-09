import { expect, test, type Page } from '@playwright/test'

async function counts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zhijian-knowledge-db')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await Promise.all(Array.from(db.objectStoreNames).filter((name) => name !== 'meta').map((name) => new Promise<[string, number]>((resolve, reject) => {
        const request = db.transaction(name, 'readonly').objectStore(name).count()
        request.onsuccess = () => resolve([name, request.result])
        request.onerror = () => reject(request.error)
      })))
    } finally { db.close() }
  })
}

test('production installation and reload start with no documents, folders, PDFs or history', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  for (const [name, count] of await counts(page)) expect(count, name).toBe(0)
  await page.reload()
  await expect(page.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  for (const [name, count] of await counts(page)) expect(count, name).toBe(0)
})

test('user-created content persists; initialization never resets the user database', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '新建思维导图', exact: true }).click()
  await page.getByLabel('文档名称', { exact: true }).fill('自行创建的文档')
  await page.getByLabel('文档名称', { exact: true }).press('Enter')
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()
  await expect.poll(async () => Object.fromEntries(await counts(page)).documents).toBe(1)
  await page.getByRole('button', { name: '返回知识库', exact: true }).click()
  await expect(page.getByText('自行创建的文档', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('自行创建的文档', { exact: true })).toBeVisible()
  expect(Object.fromEntries(await counts(page)).documents).toBe(1)
})
