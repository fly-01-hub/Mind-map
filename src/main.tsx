import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './android.css'
import App from './App.tsx'
import { useDocumentStore } from './stores/documentStore'
import { useSaveStore } from './stores/saveStore'
import { isAndroidApp, printAndroidPage } from './services/platform/androidFiles'

if (isAndroidApp()) {
  document.documentElement.dataset.platform = 'android'
  window.print = () => { void printAndroidPage().catch((error) => window.alert(error instanceof Error ? error.message : '打印失败。')) }
  window.addEventListener('researchmind:pause', () => {
    void import('./services/persistence/localPersistence').then(({ flushLocalPersistence }) => flushLocalPersistence())
      .catch(() => useSaveStore.getState().setStatus('error'))
  })
}

if (
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  && 'serviceWorker' in navigator && !isAndroidApp()
) {
  let reloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })

  let activateUpdate: (reloadPage?: boolean) => Promise<void> = async () => {}
  activateUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => { void activateUpdate(true) },
    onRegisteredSW: (_serviceWorkerUrl, registration) => {
      if (!registration) return
      const checkForUpdate = () => { void registration.update() }
      checkForUpdate()
      window.addEventListener('focus', checkForUpdate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.setInterval(checkForUpdate, 5 * 60 * 1000)
    },
  })
}

// GitHub Pages serves static files; hash routes can refresh without server rewrites.
const Router = import.meta.env.MODE === 'pages' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)

async function bootstrapData() {
  const { initializeLocalPersistence } = await import('./services/persistence/localPersistence')
  await initializeLocalPersistence()
}

void bootstrapData().catch(() => {
  useDocumentStore.setState({ hydrated: true })
  useSaveStore.getState().setStatus('error')
})
