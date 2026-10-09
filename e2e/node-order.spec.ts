import { expect, test } from './fixtures'
import { checkNodeOrder } from './nodeOrderChecks'

test('orders complete sibling branches from menus, preserving edits, history and outline persistence', async ({ page }) => {
  await page.goto('/library')
  await checkNodeOrder(page, 'test-results/node-order-browser')
})

test('multi-selection ordering keeps click-independent order and protects existing summaries', async ({ page }) => {
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const first = page.locator('.me-tpc', { hasText: '子项甲一' }).first()
  const second = page.locator('.me-tpc', { hasText: '子项甲二' }).first()
  const third = page.locator('.me-tpc', { hasText: '子项甲三' }).first()
  await first.click()
  await second.click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '概要', exact: true }).click()
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)
  await first.click()
  await page.getByRole('button', { name: '调整主题顺序' }).click()
  await page.getByRole('menuitem', { name: '移到同级末位', exact: true }).click()
  await expect(page.getByText('此次排序会拆散已有概要，已保留原顺序。请同时选择概要中的全部同级主题再移动。', { exact: true })).toBeVisible()
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)
  expect((await first.boundingBox())!.y).toBeLessThan((await second.boundingBox())!.y)
  // Deliberately select in reverse click order; move as one stable group.
  await second.click()
  await first.click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '调整主题顺序' }).click()
  await page.getByRole('menuitem', { name: '移到同级末位', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: '主题操作' })).toContainText('已选 2 项')
  await expect(page.locator('.summary [id^="s-"]')).toHaveCount(1)
  expect((await third.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y)
  expect((await first.boundingBox())!.y).toBeLessThan((await second.boundingBox())!.y)
  // Unrelated parents are not silently merged or reparented by sorting.
  await first.click()
  await page.locator('.me-tpc', { hasText: '分支乙项' }).first().click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '调整主题顺序' }).click()
  for (const label of ['上移一位', '下移一位', '移到同级首位', '移到同级末位']) {
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveAttribute('data-disabled', '')
  }
})
