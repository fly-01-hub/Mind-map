import { test } from './fixtures'
import { checkContextMenu, checkTextColors } from './textColorChecks'

test('selected plain text colors persist, undo, reset and coexist with wiki links', async ({ page }) => {
  await page.goto('/library')
  await checkTextColors(page, 'test-results/text-colors-browser')
})

test('node menu stays compact and horizontal, including submenu and short viewport', async ({ page }) => {
  await page.goto('/library')
  await checkContextMenu(page, 'test-results/text-colors-browser')
})
