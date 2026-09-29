import { create } from 'zustand'

interface SelectionState {
  selectedNodeId?: string
  selectedNodeIds: string[]
  selectionAnchorId?: string
  hoveredNodeId?: string
  setSelectedNode: (id?: string) => void
  setSelectedNodes: (ids: string[], primaryId?: string) => void
  toggleSelectedNode: (id: string) => void
  clearSelection: () => void
  setHoveredNode: (id?: string) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeIds: [],
  setSelectedNode: (selectedNodeId) => set({
    selectedNodeId,
    selectedNodeIds: selectedNodeId ? [selectedNodeId] : [],
    selectionAnchorId: selectedNodeId,
  }),
  setSelectedNodes: (ids, primaryId) => set((state) => ({
    selectedNodeIds: [...new Set(ids)],
    selectedNodeId: primaryId ?? ids.at(-1),
    selectionAnchorId: state.selectionAnchorId ?? primaryId ?? ids.at(-1),
  })),
  toggleSelectedNode: (id) => set((state) => {
    const selectedNodeIds = state.selectedNodeIds.includes(id)
      ? state.selectedNodeIds.filter((nodeId) => nodeId !== id)
      : [...state.selectedNodeIds, id]
    return {
      selectedNodeIds,
      selectedNodeId: selectedNodeIds.includes(id) ? id : selectedNodeIds.at(-1),
      selectionAnchorId: id,
    }
  }),
  clearSelection: () => set({ selectedNodeId: undefined, selectedNodeIds: [], selectionAnchorId: undefined }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
}))
