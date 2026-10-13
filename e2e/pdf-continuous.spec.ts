import { expect, test } from './fixtures'
import { createLongTestPdf } from './testPdf'

test('PDF scrolls across pages, renders nearby pages and restores the position within a page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc').first().evaluate((element, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'Continuous Reading.pdf', { type: 'application/pdf' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, Array.from(createLongTestPdf()))
  const reader = page.locator('.embedded-reader')
  const current = reader.locator('.pdf-page-shell[data-current-page="true"]')
  const workspace = reader.locator('.pdf-workspace')
  await expect(current).toHaveAttribute('aria-busy', 'false')
  await expect(reader.locator('.pdf-page-slot')).toHaveCount(20)
  await expect.poll(() => reader.locator('.pdf-page canvas').count()).toBeLessThan(8)
  const bounds = (await workspace.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 150)
  await page.mouse.wheel(0, 950)
  await expect.poll(async () => Number(await reader.getByLabel('当前页码').inputValue())).toBeGreaterThan(1)
  await reader.getByLabel('当前页码').fill('7')
  await expect(reader.locator('.pdf-page[data-current-page="true"]')).toHaveAttribute('data-page-number', '7')
  await expect(current).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => reader.locator('.pdf-page-slot[data-page-number="7"]').evaluate(element => element.clientHeight / element.parentElement!.children[0].clientHeight)).toBeCloseTo(420 / 792, 1)
  await reader.locator('.pdf-page-slot[data-page-number="12"]').evaluate(element => {
    const workspace = element.closest('.pdf-workspace')!
    workspace.scrollTop += element.getBoundingClientRect().top - workspace.getBoundingClientRect().top + element.clientHeight * .38
  })
  await expect(reader.getByLabel('当前页码')).toHaveValue('12')
  await expect(current).toHaveAttribute('aria-busy', 'false')
  const offset = () => reader.locator('.pdf-page-slot[data-page-number="12"]').evaluate(element => {
    const viewport = element.closest('.pdf-workspace')!.getBoundingClientRect()
    return (viewport.top - element.getBoundingClientRect().top) / element.clientHeight
  })
  await expect.poll(offset).toBeCloseTo(.38, 1)
  await reader.getByRole('button', { name: '放大', exact: true }).click()
  await expect.poll(offset).toBeCloseTo(.38, 1)
  await expect.poll(() => reader.locator('.pdf-page canvas').count()).toBeLessThan(8)
  await page.waitForTimeout(350)
  await reader.getByRole('button', { name: '返回思维导图', exact: true }).click()
  await page.locator('.me-tpc', { hasText: 'Continuous Reading' }).dblclick()
  await expect(reader.getByLabel('当前页码')).toHaveValue('12')
  await expect(current).toHaveAttribute('aria-busy', 'false')
  await expect.poll(offset).toBeCloseTo(.38, 1)
  await reader.getByLabel('当前页码').fill('2')
  await expect(reader.getByLabel('当前页码')).toHaveValue('2')
  await expect(current).toHaveAttribute('aria-busy', 'false')
  await reader.getByRole('button', { name: '返回思维导图', exact: true }).click()
  const paperId = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    return (await appDatabase.papers.toArray()).find(paper => paper.title === 'Continuous Reading')!.id
  })
  await page.goto(`/paper/${paperId}`)
  await expect(page).toHaveURL(/\/paper\//)
  await expect(page.locator('.pdf-continuous-pages')).toBeVisible()
  await expect(page.locator('.pdf-page-slot')).toHaveCount(20)
  await page.locator('.pdf-workspace').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(page.getByLabel('当前页码')).toHaveValue('20')
  await expect(page.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false')
  await page.screenshot({ path: 'test-results/pdf-continuous-reading.png' })
  expect(errors).toEqual([])
})
