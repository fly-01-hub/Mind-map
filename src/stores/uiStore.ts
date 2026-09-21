import { create } from 'zustand'

interface UiState {
  sidebarCollapsed: boolean
  inspectorOpen: boolean
  focusRootId?: string
  searchOpen: boolean
  toggleSidebar: () => void
  setInspectorOpen: (open: boolean) => void
  setFocusRoot: (id?: string) => void
  setSearchOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  inspectorOpen: false,
  searchOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setFocusRoot: (focusRootId) => set({ focusRootId }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}))
