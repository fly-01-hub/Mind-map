import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPartialBackup, importSelectedMaps, prepareMapImport, type PreparedMapImport } from '../../services/backup/partialBackupService'
import { saveGeneratedBackup, suggestedBackupName } from '../../services/backup/localBackupService'
import { prepareForNavigation, replaceLocalKnowledgeBase } from '../../services/persistence/localPersistence'
import { useDocumentStore } from '../../stores/documentStore'

export function PartialMapBackup({ busy, setBusy, setMessage }: {
  busy: boolean; setBusy: (value: boolean) => void; setMessage: (value: string) => void
}) {
  const documents = useDocumentStore(s => s.documents)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'export' | 'import'>()
  const [prepared, setPrepared] = useState<PreparedMapImport>()
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const choices = (mode === 'import' ? prepared?.rows.documents ?? [] : documents).filter(d => !d.deletedAt)
  const visible = choices.filter(d => d.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const chooseFile = async (file?: File) => {
    if (!file) return
    setBusy(true); setMessage('正在读取并校验导图备份…')
    try {
      const value = await prepareMapImport(file)
      setPrepared(value); setMode('import'); setSearch('')
      setSelected(value.rows.documents.filter(d => !d.deletedAt).map(d => d.id))
      setMessage('请选择要新增的导图，确认后导入；现有资料会保留。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法读取此导图备份。') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const run = async () => {
    if (!selected.length) return
    setBusy(true)
    try {
      if (mode === 'export') {
        setMessage('请选择备份保存位置，随后将整理所选导图…')
        const saved = await saveGeneratedBackup(async () => {
          setMessage('正在整理所选导图及关联文件…')
          await prepareForNavigation().catch(() => undefined)
          const state = useDocumentStore.getState()
          return createPartialBackup(selected, { documents: state.documents, folders: state.folders })
        }, suggestedBackupName('.rmpart'))
        if (!saved) return
        const { result } = saved
        setMessage(result === 'saved' ? `已保存 ${selected.length} 份导图的部分备份。` : `${selected.length} 份导图的部分备份已开始下载，请确认文件保存完成。`)
      } else if (prepared) {
        setMessage('正在新增所选导图及关联文件…')
        const result = await replaceLocalKnowledgeBase(() => importSelectedMaps(prepared, selected), true)
        setMessage(`已新增 ${result.documentCount} 份导图，关联 ${result.paperCount} 篇论文；跳过 ${result.skipped} 份已导入导图。现有资料已保留。`)
        setPrepared(undefined); setMode(undefined); setSelected([])
      }
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError' ? '已取消保存。' : error instanceof Error ? error.message : '处理失败，现有资料未被替换。')
    } finally { setBusy(false) }
  }
  return <section className="partial-backup-section" aria-label="部分导图备份与导入">
    <div className="backup-actions">
      <button className="backup-action-card" disabled={busy} onClick={() => { setMode('export'); setPrepared(undefined); setSelected([]); setSearch(''); setMessage('') }}>
        <span><Download size={20} /></span><strong>备份部分导图</strong><small>勾选导图，携带关联文件</small>
      </button>
      <button className="backup-action-card" disabled={busy} onClick={() => inputRef.current?.click()}>
        <span><Upload size={20} /></span><strong>导入部分导图</strong><small>从部分或完整备份中选择</small>
      </button>
    </div>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".rmpart,.researchmind" onChange={e => void chooseFile(e.target.files?.[0])} />
    <p className="backup-note">部分备份包含所选导图、历史、附件，以及关联 PDF 的批注和阅读进度。导入会新增副本、保留现有资料；同一文件中的同一导图不会重复导入。未选导图的文字引用不会自动携带目标文档。</p>
    {mode && <fieldset className="partial-backup-picker" disabled={busy}>
      <legend>{mode === 'export' ? '选择要备份的导图' : '选择要导入的导图'}</legend>
      <input aria-label="筛选导图" placeholder="按导图名称筛选" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="partial-backup-selection">
        <span>已选 {selected.length} / {choices.length} 份</span>
        <button className="secondary-button" onClick={() => setSelected(previous => [...new Set([...previous, ...visible.map(d => d.id)])])}>全选当前列表</button>
        <button className="secondary-button" onClick={() => setSelected([])}>清空选择</button>
      </div>
      <div className="partial-backup-list">
        {visible.map(d => <label key={d.id}>
          <input type="checkbox" aria-label={`选择导图 ${d.title}`} checked={selected.includes(d.id)}
            onChange={e => setSelected(previous => e.target.checked ? [...previous, d.id] : previous.filter(id => id !== d.id))} />
          <span>{d.title}</span>
        </label>)}
        {!visible.length && <p className="backup-note">没有符合条件的导图。</p>}
      </div>
      <div className="partial-backup-selection">
        <button className="primary-button" disabled={!selected.length} onClick={() => void run()}>{mode === 'export' ? '导出所选导图' : '新增所选导图'}</button>
        <button className="secondary-button" onClick={() => { setMode(undefined); setPrepared(undefined); setSelected([]) }}>取消选择</button>
      </div>
    </fieldset>}
  </section>
}
