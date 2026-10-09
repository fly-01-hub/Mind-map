import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('packaged desktop first launch has an empty user database', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-public-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('这里还没有思维导图', { exact: true })).toBeVisible()
    const counts = await page.evaluate(async () => {
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
    for (const [name, count] of counts) expect(count, name).toBe(0)
  } finally { await app.close() }
})
