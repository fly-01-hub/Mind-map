import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { useDocumentStore } from './stores/documentStore'
import { useSaveStore } from './stores/saveStore'

if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
  registerSW({ immediate: true })
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
