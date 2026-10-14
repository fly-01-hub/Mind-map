import { useDocumentStore } from '../../stores/documentStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { compactRichText, plainTextFromRichText, sanitizeRichText } from '../../utils/richText'
import type { NodeData } from '../../types/mindmap'
import type { EditorDraft } from './recoveryJournal'
import { findNode } from '../../utils/tree'

export function draftKey(draft: EditorDraft) {
  return JSON.stringify([draft.documentId, draft.nodeId, [...new Set([...Object.keys(draft.patch), ...(draft.clearFields ?? [])])].sort()])
}

export function isDraftCommitted(draft: EditorDraft) {
  const document = useDocumentStore.getState().documents.find((item) => item.id === draft.documentId)
  const node = document && findNode(document.root, draft.nodeId)
  return Boolean(node && [...new Set([...Object.keys(draft.patch), ...(draft.clearFields ?? [])])].every((key) => {
    const field = key as keyof NodeData
    return JSON.stringify(node[field]) === JSON.stringify(draft.clearFields?.includes(field) ? undefined : draft.patch[field])
  }))
}

export function readEditorDraft(target: EventTarget | null): EditorDraft | undefined {
  if (!(target instanceof HTMLElement)) return
  const state = useDocumentStore.getState()
  const inspector = target.closest<HTMLElement>('.node-inspector[data-document-id]')
  const document = state.documents.find((item) => item.id === (inspector?.dataset.documentId ?? state.activeDocumentId))
  if (!document || !state.hydrated) return
  let nodeId = target.dataset.editingNodeId ?? target.closest<HTMLElement>('.outline-row')?.dataset.nodeId
  let patch: Partial<NodeData> | undefined
  if (target.matches('#input-box[contenteditable], .outline-topic-input[contenteditable]')) {
    const html = sanitizeRichText(target.innerHTML)
    const title = target.id === 'input-box' ? target.innerText.trim() : plainTextFromRichText(html)
    patch = { title, richText: compactRichText(html, title) }
  } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    if (target.closest('.outline-description')) patch = { note: target.value }
    else if (target.closest('.node-inspector')) {
      nodeId = inspector?.dataset.nodeId ?? useSelectionStore.getState().selectedNodeId
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
  const node = findNode(document.root, nodeId)
  const baseValues = node && Object.fromEntries((Object.keys(patch) as Array<keyof NodeData>).map((field) => [field, JSON.stringify(node[field]) ?? null]))
  return { documentId: document.id, nodeId, version: document.version, patch, clearFields, baseValues }
}
