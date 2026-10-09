import { test } from './fixtures'
import { checkNodeControls } from './nodeControlChecks'

test('node controls follow live typing, multiline, zoom and pan without losing content', async ({ page }) => {
  await page.goto('/library')
  await checkNodeControls(page, 'test-results/node-controls-browser')
})
