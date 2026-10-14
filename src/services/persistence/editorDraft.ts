import { useDocumentStore } from '../../stores/documentStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { compactRichText, plainTextFromRichText, sanitizeRichText } from '../../utils/richText'
import type { NodeData } from '../../types/mindmap'
import type { EditorDraft } from './recoveryJournal'

export function readEditorDraft(target: EventTarget | null): EditorDraft | undefined {
  if (!(target instanceof HTMLElement)) return
  const state = useDocumentStore.getState()
  const document = state.documents.find((item) => item.id === state.activeDocumentId)
  if (!document || !state.hydrated) return
  let nodeId = target.dataset.editingNodeId ?? target.closest<HTMLElement>('.outline-row')?.dataset.nodeId
  let patch: Partial<NodeData> | undefined
  if (target.matches('#input-box[contenteditable], .outline-topic-input[contenteditable]')) {
    const html = sanitizeRichText(target.innerHTML)
    const title = plainTextFromRichText(html)
    patch = { title, richText: compactRichText(html, title) }
  } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (target.closest('.outline-description')) patch = { note: target.value }
    else if (target.closest('.node-inspector')) {
      nodeId = useSelectionStore.getState().selectedNodeId
      const value = target.value
      switch (target.id) {
        case 'node-title': patch = { title: value.trim(), richText: undefined }; break
        case 'node-note': patch = { note: value }; break
        case 'node-code': patch = { code: value || undefined }; break
        case 'node-formula': patch = { formula: value || undefined }; break
        case 'node-link': patch = { hyperlink: value.trim() || undefined }; break
        case 'node-table': {
          const rows = value.split(/\r?\n/).map((line) => {
            const cells = line.includes('\t') ? line.split('\t') : line.split('|')
            return cells.map((cell) => cell.trim()).filter((cell, index) => cell || (index > 0 && index < cells.length - 1))
          }).filter((row) => row.some(Boolean))
          const width = Math.max(0, ...rows.map((row) => row.length))
          const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
          patch = { table: rows.length ? { headers: normalized[0], rows: normalized.slice(1) } : undefined }
          break
        }
      }
    } else if (target.getAttribute('aria-label') === '文档名称') {
      nodeId = document.root.id
      patch = { title: target.value.trim(), richText: undefined }
    }
  }
  if (!nodeId || !patch) return
  const clearFields = (Object.keys(patch) as Array<keyof NodeData>).filter((field) => patch[field] === undefined)
  return { documentId: document.id, nodeId, version: document.version, patch, clearFields }
}
