import { create } from 'zustand'

export const useDataSafetyStore = create<{
  startupError?: string
  waitingForWriter: boolean
  recoveryNotice?: string
  journalError?: string
  persistentStorage?: boolean
}>(() => ({ waitingForWriter: false }))
