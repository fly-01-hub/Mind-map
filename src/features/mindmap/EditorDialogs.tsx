import * as Dialog from '@radix-ui/react-dialog'
import { Clock3, FileUp, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import type { DocumentVersion, MindMapDocument } from '../../types/mindmap'

export function HistoryDialog({ document, open, onOpenChange }: { document: MindMapDocument; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const restoreVersion = useDocumentStore((state) => state.restoreVersion)

  useEffect(() => {
    if (open) void documentRepository.listVersions(document.id).then(setVersions)
  }, [document.id, open])

  const restore = async (version: DocumentVersion) => {
    await documentRepository.createVersion(document, 'before-restore')
    restoreVersion(document.id, version.title, version.root, version.version, version.arrows, version.summaries)
    onOpenChange(false)
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="standard-dialog history-dialog">
        <header><div><p className="eyebrow">Document history</p><Dialog.Title>历史版本</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close></header>
        <Dialog.Description>查看并恢复这份思维导图的历史快照。</Dialog.Description>
        <div className="history-list">{versions.map((version) => <div className="history-row" key={version.id}><Clock3 size={16} /><div><strong>版本 {version.version}</strong><span>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))} · {version.reason}</span></div><button onClick={() => void restore(version)}><RotateCcw size={14} />恢复</button></div>)}{!versions.length && <div className="dialog-empty">修改文档一段时间后，自动快照会显示在这里。</div>}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function ImportMarkdownDialog({ open, onOpenChange, onImport, onImportFile }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (markdown: string) => void | Promise<void>
  onImportFile: (file: File) => void | Promise<void>
}) {
  const [value, setValue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!value.trim()) return
    await onImport(value)
    setValue('')
    onOpenChange(false)
  }

  const chooseFile = (file?: File) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLocaleLowerCase()
    if (extension === 'md' || extension === 'markdown') void file.text().then(setValue)
    else void Promise.resolve(onImportFile(file)).then(() => onOpenChange(false))
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="standard-dialog import-dialog">
        <header><div><p className="eyebrow">Import</p><Dialog.Title>导入为思维导图</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close></header>
        <Dialog.Description>可直接选择 Markdown、OPML、FreeMind 或新版 XMind 文件；也可以在下方粘贴 Markdown 大纲。</Dialog.Description>
        <textarea rows={13} value={value} onChange={(event) => setValue(event.target.value)} placeholder={'# 根主题\n\n- 一级主题\n  - 二级主题'} />
        <input ref={fileRef} hidden type="file" accept=".md,.markdown,.opml,.mm,.xmind,text/markdown,text/plain,text/xml,application/xml,application/x-xmind" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
        <footer><button className="secondary-button" onClick={() => fileRef.current?.click()}><FileUp size={15} />选择文件</button><button className="primary-button" disabled={!value.trim()} onClick={() => void submit()}>导入 Markdown</button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
