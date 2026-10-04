import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDocumentStore } from './stores/documentStore'

const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((module) => ({ default: module.LibraryPage })))
const MapEditorPage = lazy(() => import('./features/mindmap/MapEditorPage').then((module) => ({ default: module.MapEditorPage })))
const PaperReaderPage = lazy(() => import('./features/paper/PaperReaderPage').then((module) => ({ default: module.PaperReaderPage })))
const AnnotationsPage = lazy(() => import('./features/paper/AnnotationsPage').then((module) => ({ default: module.AnnotationsPage })))

export default function App() {
  const hydrated = useDocumentStore((state) => state.hydrated)
  if (!hydrated) return <main className="app-loading"><span /></main>
  return (
    <Suspense fallback={<main className="app-loading"><span /></main>}>
      <Routes>
        <Route path="/login" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/map/:id" element={<MapEditorPage />} />
        <Route path="/paper/:paperId" element={<PaperReaderPage />} />
        <Route path="/annotations" element={<AnnotationsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </Suspense>
  )
}
