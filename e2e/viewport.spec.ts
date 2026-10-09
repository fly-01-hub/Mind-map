import { test } from './fixtures'
import { checkViewportStability } from './viewportChecks'

test('clicking and editing keep the map stable; overflow pans only the necessary distance', async ({ page }) => {
  await page.goto('/library')
  await checkViewportStability(page, 'test-results/viewport-browser')
})
