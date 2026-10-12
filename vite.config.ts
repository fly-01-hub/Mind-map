import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = mode === 'pages' ? '/Mind-map-download/' : '/'
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'app-icon.svg', 'icons/app-192.png', 'icons/app-512.png'],
        manifest: {
          name: '枝间 · ResearchMind',
          short_name: '枝间',
          description: '本地优先的个人知识思维导图与论文阅读工具',
          theme_color: '#31483a',
          background_color: '#f7f9f7',
          display: 'standalone',
          start_url: mode === 'pages' ? `${base}#/library` : '/library',
          scope: base,
          lang: 'zh-CN',
          categories: ['productivity', 'education'],
          icons: [
            { src: `${base}icons/app-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${base}icons/app-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `${base}icons/app-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          // PDF.js emits a .mjs worker; it must be installed with the app, even
          // before the first PDF is opened and while the preview server is offline.
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  }
})
