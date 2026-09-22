import { create } from 'zustand'

interface UserState {
  id: string
  name: string
}

export const useUserStore = create<UserState>(() => ({
  id: 'local-demo-user',
  name: '本地用户',
}))
