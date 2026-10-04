import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-android', outputDir: './test-results/android', workers: 1, retries: 0, reporter: 'line',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175', reuseExistingServer: true,
  },
  use: {
    channel: 'chrome', viewport: { width: 1280, height: 800 }, hasTouch: true,
    isMobile: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
})
