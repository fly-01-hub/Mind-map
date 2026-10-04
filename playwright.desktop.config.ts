import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-desktop', workers: 1, fullyParallel: false, timeout: 60_000,
  outputDir: 'test-results/desktop', reporter: 'line',
})
