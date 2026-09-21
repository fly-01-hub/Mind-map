import { create } from 'zustand'
import type { SaveStatus } from '../types/mindmap'

interface SaveState {
  status: SaveStatus
  changedAt?: string
  markLocal: () => void
  markSaving: () => void
  setStatus: (status: SaveStatus) => void
}

export const useSaveStore = create<SaveState>((set) => ({
  status: 'local',
  markLocal: () => set({ status: 'local', changedAt: new Date().toISOString() }),
  markSaving: () => set({ status: 'saving', changedAt: new Date().toISOString() }),
  setStatus: (status) => set({ status }),
}))
