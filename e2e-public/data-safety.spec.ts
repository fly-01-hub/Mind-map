import { test, expect } from '@playwright/test'

test('production update reload commits an active editor before navigating', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '新建思维导图' })).toBeVisible()
  await expect.poll(async () => {
    try { return await page.evaluate(() => Boolean(navigator.serviceWorker.controller)) }
    catch (error) {
      if (error instanceof Error && error.message.includes('Execution context was destroyed')) return false
      throw error
    }
  }).toBe(true)
  await page.getByRole('button', { name: '新建思维导图', exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-root .me-tpc').dblclick()
  await page.locator('#input-box[contenteditable]').fill('Protected through an update reload')
  const navigation = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame())
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')))
  await navigation
  await expect(page.locator('.me-root .me-tpc')).toContainText('Protected through an update reload')
  await expect(page.getByText('已保存到本地', { exact: true })).toBeVisible()
})
