import { useUserStore } from '../../stores/userStore'
import { supabase } from './client'
import { cloudSyncService } from './cloudSyncService'

export const authService = {
  async initialize() {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    useUserStore.getState().setUser(user ? {
      id: user.id,
      name: typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : undefined,
      email: user.email,
    } : undefined)
    if (user) await cloudSyncService.pull()
    supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user
      useUserStore.getState().setUser(next ? {
        id: next.id,
        name: typeof next.user_metadata.full_name === 'string' ? next.user_metadata.full_name : undefined,
        email: next.email,
      } : undefined)
      if (next) window.setTimeout(() => { void cloudSyncService.pull() }, 0)
    })
  },

  async signInWithGoogle() {
    if (!supabase) return false
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/library` },
    })
    if (error) throw error
    return true
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut()
    useUserStore.getState().signOut()
  },
}
