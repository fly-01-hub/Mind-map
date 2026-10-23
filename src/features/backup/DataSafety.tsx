import { useDataSafetyStore } from '../../stores/dataSafetyStore'
import { useSaveStore } from '../../stores/saveStore'
import { JOURNAL_PREFIX } from '../../services/persistence/recoveryJournal'
import { createLocalBackup, saveGeneratedBackup } from '../../services/backup/localBackupService'
import './data-safety.css'

async function exportRecoveryRecords() {
  await saveGeneratedBackup(async () => {
    const records: Record<string, string | null> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(JOURNAL_PREFIX)) records[key] = localStorage.getItem(key)
    }
    return { blob: new Blob([JSON.stringify(records)], { type: 'application/json' }), fileName: 'ResearchMind-recovery-records.json', exportedAt: new Date().toISOString(), itemCount: Object.keys(records).length }
  }, 'ResearchMind-recovery-records.json')
}

export function StartupProtection() {
  const error = useDataSafetyStore((state) => state.startupError)
  const waiting = useDataSafetyStore((state) => state.waitingForWriter)
  if (!error && !waiting) return null
  return <main className="data-startup-protection" role="alert">
    <h1>{waiting ? '正在连接本地知识库' : '暂时无法安全打开知识库'}</h1>
    <p>{waiting ? '若长时间停留在此处，请关闭尚未更新的旧版枝间窗口。新版支持同时打开多份导图。' : error}</p>
    {!waiting && <><p>已停止编辑和自动写入，保留原有资料。请勿清除站点数据或卸载应用。</p><button className="primary-button" onClick={() => window.location.reload()}>重新读取</button><button className="secondary-button" onClick={() => { void exportRecoveryRecords().catch(() => window.alert('恢复记录导出失败，请保持此窗口打开。')) }}>导出恢复记录</button></>}
  </main>
}

export function DataSafetyNotice() {
  const notice = useDataSafetyStore((state) => state.recoveryNotice)
  const journalError = useDataSafetyStore((state) => state.journalError)
  const failed = useSaveStore((state) => state.status === 'error')
  if (!notice && !journalError && !failed) return null
  const exportCurrent = async () => {
    await saveGeneratedBackup(async () => {
      const { useDocumentStore } = await import('../../stores/documentStore')
      const { prepareForNavigation } = await import('../../services/persistence/localPersistence')
      await prepareForNavigation().catch(() => undefined)
      const state = useDocumentStore.getState()
      return createLocalBackup({ documents: state.documents, folders: state.folders })
    })
  }
  return <aside className={`data-safety-notice ${failed || journalError ? 'is-error' : ''}`} role={failed || journalError ? 'alert' : 'status'}>
    <span>{failed ? '保存失败，当前编辑仍在内存或恢复记录中。请保持窗口打开，检查设备空间，并导出完整备份。' : journalError ?? notice}</span>
    {failed && <button onClick={() => { void import('../../services/persistence/localPersistence').then(({ prepareForNavigation }) => prepareForNavigation()).catch(() => undefined) }}>重试保存</button>}
    {(failed || journalError) ? <button onClick={() => { void exportCurrent().catch(() => window.alert('备份导出失败，请保持窗口打开并保留当前编辑内容。')) }}>导出当前资料</button> : <button aria-label="关闭恢复提示" onClick={() => useDataSafetyStore.setState({ recoveryNotice: undefined })}>知道了</button>}
    {(failed || journalError) && <button onClick={() => { void exportRecoveryRecords().catch(() => window.alert('恢复记录导出失败，请保持此窗口打开。')) }}>导出恢复记录</button>}
  </aside>
}
