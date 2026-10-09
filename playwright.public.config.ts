import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-public',
  outputDir: './test-results/public',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:5186', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'public-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
