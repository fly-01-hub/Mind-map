import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { expect, test } from './fixtures'
// The service uses only Node built-ins and runs on an isolated test directory.
// @ts-expect-error Node-only server module has no TypeScript declaration file.
import { createSyncServer } from '../scripts/sync/server.mjs'

test('a pairing link fills the dialog without transmitting data or enabling sync automatically', async ({ page, baseURL }) => {
  const token = 'A'.repeat(43)
  await page.goto('/library#researchmind-pair=' + token)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('同步服务地址', { exact: true })).toHaveValue(baseURL!)
  await expect(page.getByLabel('同步配对密钥', { exact: true })).toHaveValue(token)
  expect(page.url()).not.toContain(token)
  expect(await page.evaluate(() => localStorage.getItem('researchmind-personal-sync-v1'))).toBeNull()
})

test('three isolated devices exchange maps, PDFs and annotations bidirectionally without overwriting conflicts', async ({ page, browser, baseURL }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'researchmind-sync-browser-'))
  const { server, store } = await createSyncServer({ directory, clientOrigins: [baseURL] })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  const secondContext = await browser.newContext({ baseURL })
  const thirdContext = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true })
  const second = await secondContext.newPage(), third = await thirdContext.newPage()
  const clients = [page, second, third]
  try {
    await second.goto('/library'); await third.goto('/library')
    for (const client of clients) {
      await expect(client.getByRole('button', { name: '设备同步', exact: true })).toBeVisible()
      await client.evaluate(async config => { const { saveSyncConfig } = await import('/src/services/sync/personalSync.ts'); saveSyncConfig(config) }, { url, token: store.token, automatic: false })
    }
    await page.evaluate(async () => {
      const { appDatabase } = await import('/src/db/appDatabase.ts')
      const now = new Date().toISOString()
      const doc = await appDatabase.documents.get('test-map')
      await appDatabase.papers.put({ id: 'sync-paper', title: '测试论文', userId: 'local', fileName: 'test.pdf', filePath: 'local://sync-paper', fileSize: 15, pageCount: 1, checksum: 'fixture', createdAt: now, updatedAt: now })
      await appDatabase.paperFiles.put({ paperId: 'sync-paper', blob: new Blob(['%PDF-sync-test'], { type: 'application/pdf' }), cachedAt: now })
      await appDatabase.attachmentBlobs.put({ id: 'sync-attachment', documentId: doc.id, nodeId: doc.root.id, blob: new Blob(['attached data'], { type: 'text/plain' }), createdAt: now })
      await appDatabase.nodePaperRelations.put({ id: 'sync-relation', documentId: doc.id, nodeId: doc.root.id, paperId: 'sync-paper', createdAt: now })
      await appDatabase.paperAnnotations.put({ id: 'sync-annotation', paperId: 'sync-paper', userId: 'local', selectedText: 'evidence', content: '三端批注', annotationType: 'highlight', pageNumber: 1, positionData: { rects: [{ x: .1, y: .1, width: .2, height: .1 }] }, createdAt: now, updatedAt: now })
      await appDatabase.paperReadingStates.put({ paperId: 'sync-paper', pageNumber: 1, zoom: 1, updatedAt: now })
    })
    const sync = async (client: typeof page) => client.evaluate(async () => { const { syncNow } = await import('/src/services/sync/personalSync.ts'); await syncNow() })
    const title = async (client: typeof page, id = 'test-map') => client.evaluate(async id => { const { appDatabase } = await import('/src/db/appDatabase.ts'); return (await appDatabase.documents.get(id))?.title }, id)
    const rename = async (client: typeof page, value: string, id = 'test-map') => client.evaluate(async ({ id, value }) => { const { useDocumentStore } = await import('/src/stores/documentStore.ts'); useDocumentStore.getState().renameDocument(id, value) }, { id, value })
    await sync(page); await sync(second); await sync(third)
    for (const client of clients) {
      expect(await client.evaluate(async () => { const { appDatabase } = await import('/src/db/appDatabase.ts'); return { pdf: await (await appDatabase.paperFiles.get('sync-paper'))!.blob.text(), attachment: await (await appDatabase.attachmentBlobs.get('sync-attachment'))!.blob.text(), annotation: (await appDatabase.paperAnnotations.get('sync-annotation'))!.content } })).toEqual({ pdf: '%PDF-sync-test', attachment: 'attached data', annotation: '三端批注' })
    }
    await sync(second); await sync(second)
    await rename(second, '第二台设备更新')
    await sync(second); await sync(page); await sync(third)
    for (const client of clients) expect(await title(client)).toBe('第二台设备更新')
    await third.evaluate(async () => {
      const { appDatabase } = await import('/src/db/appDatabase.ts')
      await appDatabase.paperAnnotations.update('sync-annotation', { content: '安卓更新批注', updatedAt: new Date().toISOString() })
    })
    await sync(third); await sync(second); await sync(page)
    for (const client of clients) expect(await client.evaluate(async () => { const { appDatabase } = await import('/src/db/appDatabase.ts'); return (await appDatabase.paperAnnotations.get('sync-annotation'))!.content })).toBe('安卓更新批注')
    const another = await page.evaluate(async () => { const { appDatabase } = await import('/src/db/appDatabase.ts'); return (await appDatabase.documents.toArray()).find(d => d.id !== 'test-map' && !d.deletedAt)!.id })
    await rename(page, 'Windows 独立更新')
    await rename(third, '安卓独立更新', another)
    await sync(page); await sync(third); await sync(second); await sync(page)
    for (const client of clients) { expect(await title(client)).toBe('Windows 独立更新'); expect(await title(client, another)).toBe('安卓独立更新') }
    // Simulate a crash after an upload committed but before its acknowledgement
    // was persisted locally. Equal content must repair the common baseline.
    await page.evaluate(async () => {
      const { appDatabase } = await import('/src/db/appDatabase.ts')
      const row = (await appDatabase.meta.get('device-sync:baseline-v1'))!
      const base = JSON.parse(row.value)
      base.index.documents['test-map'] = '0'.repeat(64)
      await appDatabase.meta.put({ key: row.key, value: JSON.stringify(base) })
    })
    await sync(page)
    await rename(second, '恢复连接后的更新'); await sync(second); await sync(page); await sync(third)
    expect(await title(page)).toBe('恢复连接后的更新')
    await rename(second, '设备二离线改动'); await rename(third, '设备三离线改动')
    await sync(second)
    await expect(sync(third)).rejects.toThrow('双向修改')
    expect(await title(third)).toBe('设备三离线改动')
    await sync(page)
    expect(await title(page)).toBe('设备二离线改动')
    // The conflict does not alter the file already saved on the third device.
    expect(await third.evaluate(async () => { const { appDatabase } = await import('/src/db/appDatabase.ts'); return (await appDatabase.paperAnnotations.get('sync-annotation'))!.content })).toBe('安卓更新批注')
    await third.getByRole('button', { name: /设备同步/ }).click()
    await expect(third.getByRole('dialog')).toBeVisible()
    await expect(third.getByRole('alert')).toContainText('双向修改')
    await third.screenshot({ path: 'test-results/device-sync-tablet.png' })
  } finally {
    await secondContext.close(); await thirdContext.close()
    await new Promise<void>(resolve => server.close(resolve))
    expect(path.dirname(path.resolve(directory))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(directory).startsWith('researchmind-sync-browser-')).toBe(true)
    await fs.rm(directory, { recursive: true, force: true })
  }
})
