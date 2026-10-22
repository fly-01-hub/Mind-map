import { test, expect } from './fixtures'

test('edits different maps in parallel, syncs the library and preserves both after reload', async ({ page, context }) => {
  await page.goto('/map/test-map')
  await expect(page.getByLabel('文档名称', { exact: true })).toBeEnabled()
  const second = await context.newPage()
  await second.goto('/map/test-map-b')
  await expect(second.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await Promise.all([
    page.locator('.outline-topic-input').nth(1).fill('第一个窗口独立保存的内容'),
    second.locator('.outline-topic-input').nth(1).fill('第二个窗口独立保存的内容'),
  ])
  await Promise.all([
    page.getByRole('button', { name: '导图', exact: true }).click(),
    second.getByRole('button', { name: '导图', exact: true }).click(),
  ])
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await expect(second.locator('.save-status')).toContainText('已保存到本地')
  await Promise.all([page.reload(), second.reload()])
  await expect(page.locator('.me-tpc', { hasText: '第一个窗口独立保存的内容' })).toHaveCount(1)
  await expect(second.locator('.me-tpc', { hasText: '第二个窗口独立保存的内容' })).toHaveCount(1)
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.locator('.outline-topic-input').nth(1).fill('窗口一刷新后继续编辑')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const historyBefore = await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    return useDocumentStore.getState().histories['test-map']?.past.length ?? 0
  })
  expect(historyBefore).toBeGreaterThan(0)
  const library = await context.newPage()
  await library.goto('/library')
  await page.getByLabel('文档名称', { exact: true }).fill('窗口一重命名')
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(library.getByText('窗口一重命名', { exact: true })).toBeVisible()
  // A new library must not reset the active map or undo stack in either editor.
  await expect(second.getByLabel('文档名称', { exact: true })).toHaveValue('测试主题乙')
  expect(await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    return useDocumentStore.getState().histories['test-map']?.past.length ?? 0
  })).toBe(historyBefore)
})

test('opens independent windows from the library and the editor picker', async ({ page, context }) => {
  const created = context.waitForEvent('page')
  await page.getByRole('button', { name: '在新窗口打开：测试导图甲', exact: true }).click()
  const first = await created
  await expect(first.getByLabel('文档名称', { exact: true })).toHaveValue('测试导图甲')
  await expect(first.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await expect(page.getByRole('heading', { name: '全部文档', exact: true })).toBeVisible()
  await first.getByRole('button', { name: '多窗口打开导图', exact: true }).click()
  await first.getByLabel('查找要同时打开的导图').fill('测试导图乙')
  const next = context.waitForEvent('page')
  await first.getByRole('menuitem', { name: '测试导图乙', exact: true }).click()
  const second = await next
  await expect(second.getByLabel('文档名称', { exact: true })).toHaveValue('测试导图乙')
  await expect(second.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await expect(first.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await first.screenshot({ path: 'test-results/multi-window-editor.png' })
})

test('never consumes another live window recovery journal, and recovers it on crash handover', async ({ page, context }) => {
  await page.goto('/map/test-map')
  await expect(page.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await page.evaluate(async () => {
    const { documentRepository } = await import('/src/repositories/documentRepository.ts')
    documentRepository.saveWorkspace = async () => { throw new Error('Simulated write failure') }
  })
  await page.locator('.outline-topic-input').nth(1).fill('未保存但受保护的窗口草稿')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('保存失败')
  const second = await context.newPage()
  await second.goto('/map/test-map')
  await expect(second.getByText('只读 · 等待其他窗口结束编辑')).toBeVisible()
  expect(await second.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    return appDatabase.documents.count()
  })).toBe(3)
  await expect(second.locator('.me-tpc', { hasText: '未保存但受保护的窗口草稿' })).toHaveCount(0)
  const crash = page.waitForEvent('crash')
  const session = await context.newCDPSession(page)
  void session.send('Page.crash').catch(() => undefined)
  await crash
  await page.close().catch(() => undefined)
  await expect(second.getByLabel('文档名称', { exact: true })).toBeEnabled()
  await expect(second.locator('.me-tpc', { hasText: '未保存但受保护的窗口草稿' })).toHaveCount(1)
})

test('refuses whole-library replacement while another live window has the library open', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto('/library')
  await expect(second.getByRole('button', { name: '新建思维导图' })).toBeVisible()
  const result = await page.evaluate(async () => {
    const { replaceLocalKnowledgeBase } = await import('/src/services/persistence/localPersistence.ts')
    let called = false
    try { await replaceLocalKnowledgeBase(async () => { called = true }) }
    catch (error) { return { called, error: (error as Error).message } }
    return { called }
  })
  expect(result.called).toBe(false)
  expect(result.error).toContain('先关闭其他枝间窗口')
  await second.close()
})
