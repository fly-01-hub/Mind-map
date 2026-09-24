import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        start_url: '/library',
        scope: '/',
        lang: 'zh-CN',
        categories: ['productivity', 'education'],
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
