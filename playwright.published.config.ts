import { defineConfig } from '@playwright/test'
import pagesConfig from './playwright.pages.config'

// Always uses Playwright's temporary profile; no user browser data is opened.
export default defineConfig({
  ...pagesConfig,
  outputDir: './test-results/published',
  timeout: 120_000,
  expect: { timeout: 30_000 }, // First-load chunks cross the network on public Pages.
  webServer: undefined,
  use: { ...pagesConfig.use, baseURL: 'https://fly-01-hub.github.io/Mind-map-download/' },
})
