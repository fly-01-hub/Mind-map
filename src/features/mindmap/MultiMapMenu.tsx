import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Library, PanelsTopLeft, Search } from 'lucide-react'
import { useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { openDocumentWindow } from '../../services/platform/openDocumentWindow'

export function MultiMapMenu({ currentId }: { currentId: string }) {
  const documents = useDocumentStore((state) => state.documents)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const available = documents.filter((document) => !document.deletedAt && document.id !== currentId && document.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <DropdownMenu.Root open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery('') }}>
    <DropdownMenu.Trigger asChild><button className="toolbar-action-button" aria-label="多窗口打开导图" title="在独立窗口中打开其他导图，可并排阅读和编辑"><PanelsTopLeft size={16} /><span>多窗口</span></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content multi-map-menu" align="end">
      <DropdownMenu.Item className="dropdown-item" onSelect={() => openDocumentWindow()}><Library size={15} />在新窗口打开知识库</DropdownMenu.Item>
      <DropdownMenu.Separator className="context-separator" />
      <DropdownMenu.Label className="dropdown-label">选择另一份导图，在新窗口打开</DropdownMenu.Label>
      <label className="multi-map-search"><Search size={14} /><input aria-label="查找要同时打开的导图" placeholder="搜索导图名称…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation() }} /></label>
      <div className="multi-map-options">
        {available.map((document) => <DropdownMenu.Item key={document.id} className="dropdown-item" textValue={document.title} onSelect={() => openDocumentWindow(document.id)}><PanelsTopLeft size={15} /><span>{document.title}</span></DropdownMenu.Item>)}
        {!available.length && <p className="multi-map-empty">{query ? '没有找到匹配的导图' : '暂无其他导图，可以在知识库中新建'}</p>}
      </div>
      <p className="multi-map-hint">不同导图可同时编辑，各窗口自动保存。</p>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
