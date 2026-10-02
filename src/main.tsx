import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { useDocumentStore } from './stores/documentStore'
import { useSaveStore } from './stores/saveStore'

if (
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  && 'serviceWorker' in navigator
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
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
