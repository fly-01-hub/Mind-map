import { ArrowRight, BrainCircuit } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { authService } from '../../services/supabase/authService'
import { isSupabaseConfigured } from '../../services/supabase/client'

export function LoginPage() {
  const navigate = useNavigate()
  const enterDemo = useUserStore((state) => state.enterDemo)
  const [authError, setAuthError] = useState('')

  const googleLogin = async () => {
    if (!isSupabaseConfigured) {
      setAuthError('尚未配置 Supabase。你可以先使用本地模式。')
      return
    }
    try { await authService.signInWithGoogle() } catch { setAuthError('Google 登录启动失败，请检查 Supabase OAuth 配置。') }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><BrainCircuit size={22} /></div>
        <p className="eyebrow">个人知识空间</p>
        <h1>让复杂的想法<br />逐渐清晰。</h1>
        <p className="login-copy">把论文、项目与灵感整理成可以持续生长的知识结构。</p>
        <button className="google-button" onClick={() => void googleLogin()}>
          <span className="google-g">G</span>
          使用 Google 登录
          <ArrowRight size={17} />
        </button>
        <button className="text-button" onClick={() => { enterDemo(); navigate('/library') }}>暂以本地模式进入</button>
        {authError && <p className="auth-error">{authError}</p>}
        <p className="login-note">本地模式不会上传内容；配置 Supabase 后可启用跨设备同步</p>
      </section>
    </main>
  )
}
