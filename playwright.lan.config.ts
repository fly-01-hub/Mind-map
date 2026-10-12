import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-lan', outputDir: './test-results/lan', timeout: 60_000,
  workers: 1, reporter: 'line',
  webServer: {
    command: 'node scripts/lan-loopback-test-server.mjs',
    url: 'http://127.0.0.1:5198/__health', reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:5198', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'lan-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
