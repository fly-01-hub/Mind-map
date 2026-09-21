import { create } from 'zustand'

interface UserState {
  id?: string
  name?: string
  email?: string
  isDemo: boolean
  enterDemo: () => void
  signOut: () => void
  setUser: (user?: { id: string; name?: string; email?: string }) => void
}

export const useUserStore = create<UserState>((set) => ({
  isDemo: true,
  id: 'local-demo-user',
  name: '本地用户',
  email: 'local@example.com',
  enterDemo: () => set({ id: 'local-demo-user', name: '本地用户', email: 'local@example.com', isDemo: true }),
  signOut: () => set({ id: undefined, name: undefined, email: undefined, isDemo: false }),
  setUser: (user) => set(user ? { ...user, isDemo: false } : { id: undefined, name: undefined, email: undefined, isDemo: false }),
}))
