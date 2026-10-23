import { expect, test } from './fixtures'

test('selects the destination during the click and saves after slow backup preparation', async ({ page }) => {
  await page.evaluate(() => {
    Object.assign(window, { backupSave: { activation: false, bytes: 0, closed: false } })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: function(this: Window) {
      const state = (window as unknown as { backupSave: { activation: boolean; bytes: number; closed: boolean } }).backupSave
      if (this !== window || !navigator.userActivation.isActive) throw new DOMException('Must be handling a user gesture', 'SecurityError')
      state.activation = true
      return Promise.resolve({ createWritable: async () => ({ write: async (blob: Blob) => { state.bytes = blob.size }, close: async () => { state.closed = true }, abort: async () => {} }) })
    } })
  })
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  // Expire activation in the real backup path, without slowing fixture setup.
  await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    const transaction = appDatabase.transaction.bind(appDatabase)
    Object.assign(appDatabase, { transaction: (...args: unknown[]) => new Promise(resolve => setTimeout(resolve, 5500)).then(() => Reflect.apply(transaction, appDatabase, args)) })
  })
  await page.getByRole('button', { name: /创建完整备份/ }).click()
  await expect(page.getByRole('status')).toContainText('备份已保存', { timeout: 30000 })
  expect(await page.evaluate(() => (window as unknown as { backupSave: unknown }).backupSave)).toMatchObject({ activation: true, closed: true })
  expect(await page.evaluate(() => (window as unknown as { backupSave: { bytes: number } }).backupSave.bytes)).toBeGreaterThan(100)
})

test('cancelled destination leaves the library unchanged and no saved message', async ({ page }) => {
  const before = await page.locator('.document-row').count()
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: () => Promise.reject(new DOMException('cancelled', 'AbortError')) }))
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await page.getByRole('button', { name: /创建完整备份/ }).click()
  await expect(page.getByRole('status')).toContainText('已取消保存')
  await expect(page.getByRole('button', { name: /创建完整备份/ })).toBeEnabled()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.locator('.document-row')).toHaveCount(before)
})

test('selected-map and safety-snapshot exports also open the picker during the click', async ({ page }) => {
  await page.evaluate(async () => {
    const { createLocalBackup, restoreLocalBackup } = await import('/src/services/backup/localBackupService.ts')
    await restoreLocalBackup((await createLocalBackup()).blob)
    Object.assign(window, { savedExtensions: [] })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: (options: { suggestedName: string }) => {
      if (!navigator.userActivation.isActive) throw new DOMException('Must be handling a user gesture', 'SecurityError')
      return Promise.resolve({ createWritable: async () => ({ write: async () => { (window as unknown as { savedExtensions: string[] }).savedExtensions.push(options.suggestedName.split('.').pop()!) }, close: async () => {}, abort: async () => {} }) })
    } })
  })
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await page.getByRole('button', { name: /备份部分导图/ }).click()
  await page.getByRole('checkbox', { name: '选择导图 测试导图甲', exact: true }).check()
  await page.getByRole('button', { name: '导出所选导图', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存 1 份导图')
  await page.getByRole('button', { name: '导出恢复前安全副本', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('恢复前安全副本已保存')
  expect(await page.evaluate(() => (window as unknown as { savedExtensions: string[] }).savedExtensions)).toEqual(['rmpart', 'researchmind'])
})
