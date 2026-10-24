import * as Dialog from '@radix-ui/react-dialog'
import { Cloud, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadSyncConfig, saveSyncConfig, syncNow, useSyncStatus } from '../../services/sync/personalSync'
import './device-sync.css'
import { getPairingHint, clearPairingHint } from '../../services/sync/pairingHint'

export function DeviceSyncDialog() {
  const status = useSyncStatus()
  const [open, setOpen] = useState(() => !!getPairingHint())
  const [url, setUrl] = useState(() => getPairingHint()?.url ?? '')
  const [token, setToken] = useState(() => getPairingHint()?.token ?? '')
  const [automatic, setAutomatic] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const showHint = () => {
      const hint = getPairingHint()
      if (!hint || useSyncStatus.getState().busy) return
      setUrl(hint.url); setToken(hint.token); setError(''); setOpen(true)
    }
    window.addEventListener('researchmind:pairing-hint', showHint)
    return () => window.removeEventListener('researchmind:pairing-hint', showHint)
  }, [])
  const changeOpen = (value: boolean) => {
    if (status.busy) return
    if (value) {
      const current = loadSyncConfig()
      setUrl(current?.url ?? (window.location.hostname.endsWith('.ts.net') ? window.location.origin : ''))
      setToken(current?.token ?? ''); setAutomatic(current?.automatic ?? true); setError('')
    }
    if (!value) clearPairingHint()
    setOpen(value)
  }
  const connect = async () => {
    try { setError(''); saveSyncConfig({ url, token, automatic }); clearPairingHint(); await syncNow() }
    catch (e) { setError(e instanceof Error ? e.message : '连接失败，现有资料已保留。') }
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button className="secondary-button device-sync-button" title={status.error ?? status.message}><Cloud size={16} />设备同步{status.error ? ' · 未完成' : status.busy ? ' · 进行中' : ''}</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="standard-dialog device-sync-dialog">
        <header><div><p className="eyebrow">个人设备 · 双向同步</p><Dialog.Title>三台设备双向同步</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭设备同步" disabled={status.busy}><X size={18} /></button></Dialog.Close></header>
        <Dialog.Description>任意一台设备的导图、PDF、附件、批注及阅读进度都可同步到另外两台。Windows 同步主机需保持在线，三台设备的 Tailscale 需连接同一个个人网络。</Dialog.Description>
        <label className="device-sync-field">同步服务地址<input aria-label="同步服务地址" placeholder="https://你的Windows.你的网络.ts.net" value={url} disabled={status.busy} onChange={e => setUrl(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
        <label className="device-sync-field">配对密钥<input aria-label="同步配对密钥" type="password" value={token} disabled={status.busy} onChange={e => setToken(e.target.value)} autoComplete="off" /></label>
        <label className="device-sync-automatic"><input type="checkbox" checked={automatic} disabled={status.busy} onChange={e => setAutomatic(e.target.checked)} />自动同步（打开、恢复连接及空闲时约每 30 秒检查）</label>
        <p>首次只需三台设备各配对一次。PDF 首次传输可能较久；以后复用相同文件。离线编辑先保存在本机，同一条记录在两边分别改过时停止覆盖并提示冲突。</p>
        <p className="device-sync-status" role="status">{status.message}{status.lastSuccess && <><br />上次完成：{new Date(status.lastSuccess).toLocaleString('zh-CN')}</>}</p>
        {(error || status.error) && <p className="device-sync-error" role="alert">{error || status.error}</p>}
        <footer><button className="secondary-button" disabled={status.busy || !status.configured} onClick={() => { saveSyncConfig(); setToken(''); setError('') }}>断开同步</button><button className="primary-button" disabled={status.busy || !url.trim() || !token.trim()} onClick={() => void connect()}><RefreshCw size={15} />{status.busy ? '正在同步…' : '连接并立即同步'}</button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
