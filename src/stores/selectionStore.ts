import { create } from 'zustand'

interface SelectionState {
  selectedNodeId?: string
  hoveredNodeId?: string
  setSelectedNode: (id?: string) => void
  setHoveredNode: (id?: string) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
}))
