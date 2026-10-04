import * as Dialog from '@radix-ui/react-dialog'
import { Download, HardDrive, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { createLocalBackup, restoreLocalBackup, saveBackupFile } from '../../services/backup/localBackupService'
import { flushLocalPersistence } from '../../services/persistence/localPersistence'
import { isAndroidApp } from '../../services/platform/androidFiles'

export function BackupDialog() {
  const storageLocation = isAndroidApp() ? '此设备应用' : window.location.protocol === 'app:' ? '此电脑应用' : '当前浏览器'
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const exportBackup = async () => {
    setBusy(true)
    setMessage('正在整理本地资料…')
    try {
      await flushLocalPersistence()
      const backup = await createLocalBackup()
      await saveBackupFile(backup)
      setMessage(`备份已保存，共包含 ${backup.itemCount} 条数据。建议另存到安全的本地文件夹或移动硬盘。`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage('已取消保存。')
      else setMessage(error instanceof Error ? error.message : '备份失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (file?: File) => {
    if (!file) return
    if (!window.confirm(`恢复备份会替换${storageLocation}中的全部 ResearchMind 数据。确定继续吗？`)) {
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setBusy(true)
    setMessage('正在验证并恢复备份…')
    try {
      const result = await restoreLocalBackup(file)
      window.alert(`恢复完成：${result.documentCount} 份导图，${result.paperCount} 篇论文。页面将重新载入。`)
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复失败，当前数据未被替换。')
      if (inputRef.current) inputRef.current.value = ''
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="secondary-button"><HardDrive size={16} />备份与恢复</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="standard-dialog backup-dialog">
          <header>
            <div><p className="eyebrow">本地资料保护</p><Dialog.Title>备份与恢复</Dialog.Title></div>
            <Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close>
          </header>
          <Dialog.Description>
            备份文件包含导图、历史版本、附件、PDF、批注和阅读进度。你可以保存到任意本地文件夹、移动硬盘，或自行选择的同步目录。
          </Dialog.Description>
          <div className="backup-actions">
            <button className="backup-action-card" disabled={busy} onClick={() => void exportBackup()}>
              <span><Download size={20} /></span><strong>创建完整备份</strong><small>生成一个 .researchmind 文件</small>
            </button>
            <button className="backup-action-card" disabled={busy} onClick={() => inputRef.current?.click()}>
              <span><Upload size={20} /></span><strong>从备份恢复</strong><small>恢复前会再次确认</small>
            </button>
            <input ref={inputRef} className="visually-hidden" type="file" accept=".researchmind,application/json" onChange={(event) => void importBackup(event.target.files?.[0])} />
          </div>
          <div className="backup-note"><ShieldCheck size={16} /><span>所有资料默认只保存在{storageLocation}中。定期把备份文件放入百度网盘，可防止设备损坏或本地数据被清除造成丢失。</span></div>
          {message && <p className="backup-message" role="status"><RotateCcw size={14} />{message}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
