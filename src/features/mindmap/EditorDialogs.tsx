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
    restoreVersion(document.id, version.title, version.root, version.version)
    onOpenChange(false)
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="standard-dialog history-dialog"><header><div><p className="eyebrow">Document history</p><Dialog.Title>历史版本</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close></header><Dialog.Description>查看并恢复这份思维导图的历史快照。</Dialog.Description><div className="history-list">{versions.map((version) => <div className="history-row" key={version.id}><Clock3 size={16} /><div><strong>版本 {version.version}</strong><span>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))} · {version.reason}</span></div><button onClick={() => void restore(version)}><RotateCcw size={14} />恢复</button></div>)}{!versions.length && <div className="dialog-empty">修改文档一段时间后，自动快照会显示在这里。</div>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
}

export function ImportMarkdownDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (markdown: string) => void | Promise<void> }) {
  const [value, setValue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const submit = async () => { if (value.trim()) { await onImport(value); setValue(''); onOpenChange(false) } }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="standard-dialog import-dialog"><header><div><p className="eyebrow">Markdown</p><Dialog.Title>导入为思维导图</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close></header><Dialog.Description>粘贴 Markdown 大纲，或选择一个 `.md` 文件。标题与缩进列表会转换为树结构。</Dialog.Description><textarea rows={13} value={value} onChange={(event) => setValue(event.target.value)} placeholder={'# 根主题\n\n- 一级主题\n  - 二级主题'} /><input ref={fileRef} hidden type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setValue) }} /><footer><button className="secondary-button" onClick={() => fileRef.current?.click()}><FileUp size={15} />选择文件</button><button className="primary-button" disabled={!value.trim()} onClick={() => void submit()}>导入</button></footer></Dialog.Content></Dialog.Portal></Dialog.Root>
}
