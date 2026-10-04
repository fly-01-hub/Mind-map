// Read-only UI smoke check of the installed app. Never creates or restores documents.
import { _electron as electron, expect } from '@playwright/test'
import path from 'node:path'

const executablePath = process.argv[2]
if (!executablePath || !path.isAbsolute(executablePath)) throw new Error('Supply the absolute installed EXE path')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath, env, timeout: 30_000 })
try {
  const info = await app.evaluate(({ app: running }) => ({
    version: running.getVersion(), userData: running.getPath('userData'),
  }))
  expect(info.version).toBe('1.6.0')
  const page = await app.firstWindow()
  await expect(page.getByRole('button', { name: '新建思维导图' })).toBeVisible()
  // The app displays this button only after local data hydration completes.
  const counts = await page.evaluate(async () => {
    const databases = await indexedDB.databases()
    if (!databases.some((db) => db.name === 'zhijian-knowledge-db')) throw new Error('Expected local database missing')
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('zhijian-knowledge-db')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const stores = Array.from(db.objectStoreNames)
      const transaction = db.transaction(stores, 'readonly')
      return await Promise.all(stores.map((name) => new Promise((resolve, reject) => {
        const request = transaction.objectStore(name).count()
        request.onsuccess = () => resolve({ table: name, count: request.result })
        request.onerror = () => reject(request.error)
      })))
    } finally { db.close() }
  })
  await page.screenshot({ path: 'release/installed-1.6.0-library.png' })
  // Open existing content for visual verification; no title or node edits.
  const firstDocument = page.locator('.document-card, .document-row').first()
  if (await firstDocument.count()) {
    await firstDocument.click()
    await expect(page.getByLabel('文档名称', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '双向链接与反向引用' })).toBeVisible()
    await page.screenshot({ path: 'release/installed-1.6.0-existing-document.png' })
  }
  console.log(JSON.stringify({ ...info, visible: true, counts }))
} finally { await app.close() }
