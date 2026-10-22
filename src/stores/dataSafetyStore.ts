import { create } from 'zustand'

export const useDataSafetyStore = create<{
  startupError?: string
  waitingForWriter: boolean
  editingDocumentId?: string
  waitingDocumentId?: string
  recoveryNotice?: string
  journalError?: string
  persistentStorage?: boolean
}>(() => ({ waitingForWriter: false }))
