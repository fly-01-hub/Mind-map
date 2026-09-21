import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { useDocumentStore } from './stores/documentStore'
import { useSaveStore } from './stores/saveStore'

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
  const { authService } = await import('./services/supabase/authService')
  await authService.initialize()
}

void bootstrapData().catch(() => {
  useDocumentStore.setState({ hydrated: true })
  useSaveStore.getState().setStatus('error')
})
