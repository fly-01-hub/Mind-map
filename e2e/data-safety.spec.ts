import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from './fixtures'

async function crashAndReopen(page: Page) {
  const context = page.context()
  const crash = page.waitForEvent('crash')
  const session = await context.newCDPSession(page)
  void session.send('Page.crash').catch(() => undefined)
  await crash
  await page.close().catch(() => undefined)
  const reopened = await context.newPage()
  await reopened.goto('/map/test-map')
  return reopened
}

test('recovers a map topic from a renderer crash while its editor is still focused', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const root = page.locator('.me-root .me-tpc')
  await root.dblclick()
  await page.locator('#input-box[contenteditable]').fill('Typed before a renderer crash')
  await expect(page.locator('#input-box[contenteditable]')).toBeFocused()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('researchmind-recovery-v1:') && localStorage.getItem(key)?.includes('Typed before a renderer crash')))).toBe(true)
  const reopened = await crashAndReopen(page)
  await expect(reopened.locator('.me-root .me-tpc')).toContainText('Typed before a renderer crash')
  await expect(reopened.locator('.data-safety-notice')).toContainText('已自动恢复')
  await reopened.reload()
  await expect(reopened.locator('.me-root .me-tpc')).toContainText('Typed before a renderer crash')
})

test('recovers an unblurred outline topic on immediate reload', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.locator('.outline-topic-input').nth(1).fill('Outline draft before reload')
  await page.reload()
  await expect(page.locator('.outline-topic-input', { hasText: 'Outline draft before reload' })).toHaveCount(1)
})

test('retains failed writes, exports the newest in-memory data and retries without a false saved label', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'showSaveFilePicker') })
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.evaluate(async () => {
    const { documentRepository } = await import('/src/repositories/documentRepository.ts')
    Reflect.set(window, '__originalSaveWorkspace', documentRepository.saveWorkspace)
    documentRepository.saveWorkspace = async () => { throw new DOMException('Simulated storage quota', 'QuotaExceededError') }
  })
  await page.locator('.me-root .me-tpc').dblclick()
  await page.locator('#input-box[contenteditable]').fill('Protected during write failure')
  await page.locator('#input-box[contenteditable]').press('Escape')
  await expect(page.locator('.data-safety-notice')).toContainText('保存失败')
  await expect(page.locator('.save-status')).toContainText('保存失败')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前资料', exact: true }).click()
  const download = await downloadPromise
  const payload = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(payload.tables.documents.find((document: { id: string }) => document.id === 'test-map').root.title).toBe('Protected during write failure')
  await page.evaluate(async () => {
    const { documentRepository } = await import('/src/repositories/documentRepository.ts')
    documentRepository.saveWorkspace = Reflect.get(window, '__originalSaveWorkspace')
  })
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.reload()
  await expect(page.locator('.me-root .me-tpc')).toContainText('Protected during write failure')
})

test('never offers an editable empty library after a failed database read', async ({ page }) => {
  await page.goto('/library')
  await page.evaluate(() => sessionStorage.setItem('simulate-open-failure', 'yes'))
  await page.addInitScript(() => {
    if (sessionStorage.getItem('simulate-open-failure')) {
      sessionStorage.removeItem('simulate-open-failure')
      Object.defineProperty(IDBFactory.prototype, 'open', { configurable: true, value: () => { throw new DOMException('Simulated database failure', 'UnknownError') } })
    }
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '暂时无法安全打开知识库' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建思维导图' })).toHaveCount(0)
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(page.getByText('测试导图甲', { exact: true })).toBeVisible()
})

test('coordinates two windows and reads the latest data when the first window closes', async ({ page, context }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.locator('.outline-topic-input').nth(1).fill('Draft retained between windows')
  const second = await context.newPage()
  await second.goto('/library')
  await expect(second.getByRole('heading', { name: '此知识库已在另一个窗口打开' })).toBeVisible()
  await page.close()
  await expect(second.getByRole('button', { name: '新建思维导图' })).toBeVisible()
  await second.goto('/map/test-map')
  await expect(second.locator('.outline-topic-input', { hasText: 'Draft retained between windows' })).toHaveCount(1)
})

test('restores atomically without an old pending save overwriting it and retains a complete safety snapshot', async ({ page }) => {
  await page.goto('/map/test-map')
  await expect(page.getByRole('button', { name: '节点详情', exact: true })).toBeVisible()
  const result = await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const { createLocalBackup, restoreLocalBackup, latestSafetyBackup } = await import('/src/services/backup/localBackupService.ts')
    const { replaceLocalKnowledgeBase } = await import('/src/services/persistence/localPersistence.ts')
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    const state = useDocumentStore.getState()
    const current = state.documents.find((item) => item.id === 'test-map')!
    state.openDocument(current.id)
    state.updateNode(current.root.id, { note: 'Pending edit retained in pre-restore snapshot' })
    const payload = JSON.parse(await (await createLocalBackup()).blob.text())
    payload.tables.documents = [{ ...current, id: 'restored-target', title: 'Restored target', root: { ...current.root, title: 'Restored target' } }]
    await replaceLocalKnowledgeBase(() => restoreLocalBackup(new Blob([JSON.stringify(payload)], { type: 'application/json' })))
    const snapshot = JSON.parse(await (await latestSafetyBackup())!.blob.text())
    return { documents: await appDatabase.documents.toArray(), previous: snapshot.tables.documents.find((item: { id: string }) => item.id === 'test-map'), history: useDocumentStore.getState().histories }
  })
  expect(result.documents.map((document) => document.id)).toEqual(['restored-target'])
  expect(result.previous.root.note).toBe('Pending edit retained in pre-restore snapshot')
  expect(result.history).toEqual({})
  await page.waitForTimeout(700) // Exercise the old debounce deadline after replacement.
  await page.goto('/library')
  await expect(page.getByText('Restored target', { exact: true })).toBeVisible()
  await expect(page.getByText('测试导图甲', { exact: true })).toHaveCount(0)
})

test('recovers an inspector Markdown note that was never blurred before a renderer crash', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-root .me-tpc').click()
  await page.getByRole('button', { name: '节点详情', exact: true }).click()
  await page.locator('#node-note').fill('## Important note\nTyped before a crash')
  await expect(page.locator('#node-note')).toHaveValue('## Important note\nTyped before a crash')
  await expect(page.locator('#node-note')).toBeFocused()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('researchmind-recovery-v1:')).map((key) => localStorage.getItem(key)).join('\n'))).toContain('Typed before a crash')
  const reopened = await crashAndReopen(page)
  await reopened.locator('.me-root .me-tpc').click()
  await reopened.getByRole('button', { name: '节点详情', exact: true }).click()
  await expect(reopened.locator('#node-note')).toHaveValue('## Important note\nTyped before a crash')
})
