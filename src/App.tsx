import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDocumentStore } from './stores/documentStore'

const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((module) => ({ default: module.LibraryPage })))
const MapEditorPage = lazy(() => import('./features/mindmap/MapEditorPage').then((module) => ({ default: module.MapEditorPage })))

export default function App() {
  const hydrated = useDocumentStore((state) => state.hydrated)
  if (!hydrated) return <main className="app-loading"><span /></main>
  return (
    <Suspense fallback={<main className="app-loading"><span /></main>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/map/:id" element={<MapEditorPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </Suspense>
  )
}
