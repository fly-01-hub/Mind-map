import { test, expect } from '@playwright/test'

test('edits 5000 nodes without replacing untouched topics, preserves undo and survives reload', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '新建思维导图' })).toBeVisible()
  await page.evaluate(async () => {
    const now = new Date().toISOString()
    const nodes = Array.from({ length: 5000 }, (_, index) => ({
      id: `large-${index}`, title: index ? `Synthetic topic ${index}` : 'Synthetic large map', children: [] as unknown[],
      collapsed: false, order: index ? (index - 1) % 10 : 0, createdAt: now, updatedAt: now,
      style: {}, tags: [], taskStatus: 'none', note: 'Synthetic research note. '.repeat(8), attachments: [],
    }))
    for (let i = 1; i < nodes.length; i++) nodes[Math.floor((i - 1) / 10)].children.push(nodes[i])
    localStorage.setItem('zhijian-editor-view', 'mindmap')
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('zhijian-knowledge-db')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('documents', 'readwrite')
        transaction.objectStore('documents').put({ id: 'synthetic-large', title: nodes[0].title, root: nodes[0], isFavorite: false, version: 1, createdAt: now, updatedAt: now })
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
  await page.goto('/map/synthetic-large')
  await expect(page.locator('.me-tpc')).toHaveCount(5000, { timeout: 30_000 })
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.getByRole('button', { name: '居中', exact: true }).click()
  const root = page.locator('[data-nodeid="melarge-0"]')
  const original = await page.locator('[data-nodeid="melarge-10"]').elementHandle()
  await root.click()
  await page.keyboard.press('Tab')
  const editor = page.locator('#input-box[contenteditable]')
  await expect(editor).toBeVisible()
  await editor.fill('Added large-map topic')
  await editor.press('Escape')
  await expect(page.locator('.me-tpc')).toHaveCount(5001)
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.me-tpc')).toHaveCount(5000)
  await page.keyboard.press('Control+Shift+z')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.me-tpc').filter({ hasText: 'Added large-map topic' })).toHaveCount(1)
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true)
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.me-tpc')).toHaveCount(5001, { timeout: 30_000 })
  await expect(page.locator('.me-tpc').filter({ hasText: 'Added large-map topic' })).toHaveCount(1)
  expect(errors).toEqual([])
})
