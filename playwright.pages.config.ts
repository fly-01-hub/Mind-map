import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-pages',
  outputDir: './test-results/pages',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  webServer: {
    command: 'npm run preview -- --mode pages --outDir dist-pages --host 127.0.0.1 --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187/Mind-map-download/',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5187/Mind-map-download/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'pages-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
