import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useDocumentStore } from '../../stores/documentStore'
import { paperKnowledgeService } from '../../services/paper/paperKnowledgeService'
import type { NodeData } from '../../types/mindmap'
import { knowledgeAction } from '../../stores/knowledgeFeedbackStore'

function flattenKnowledgeNodes(node: NodeData, path = ''): { id: string; title: string; path: string }[] {
  const next = path ? `${path} / ${node.title}` : node.title
  return [{ id: node.id, title: node.title, path: next }, ...node.children.flatMap((child) => flattenKnowledgeNodes(child, next))]
}

export function LinkAnnotationDialog({ annotationIds, defaultDocumentId, defaultNodeId, onClose }: {
  annotationIds: string[]; defaultDocumentId?: string; defaultNodeId?: string; onClose: () => void
}) {
  const allDocuments = useDocumentStore((state) => state.documents)
  const documents = allDocuments.filter((item) => !item.deletedAt)
  const initial = documents.find((item) => item.id === defaultDocumentId) ?? documents[0]
  const [documentId, setDocumentId] = useState(initial?.id ?? '')
  const [selected, setSelected] = useState<string[]>(defaultNodeId && initial?.id === defaultDocumentId ? [defaultNodeId] : [])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const document = documents.find((item) => item.id === documentId)
  const nodes = document ? flattenKnowledgeNodes(document.root) : []
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const added = await paperKnowledgeService.linkAnnotations(annotationIds, documentId, selected)
      await knowledgeAction(async () => {}, added.length ? `已建立 ${added.length} 条批注关联` : '这些批注已经关联，无需重复添加', added.length ? () => paperKnowledgeService.unlinkRelations(added) : undefined)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '关联失败。'); setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="standard-dialog knowledge-link-dialog">
      <header><Dialog.Title>关联已有节点</Dialog.Title><button aria-label="关闭" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      <Dialog.Description>将 {annotationIds.length} 条批注引用到节点。可多选；原文和批注只保存一份，不覆盖节点内容。</Dialog.Description>
      <label>思维导图<select value={documentId} onChange={(event) => { setDocumentId(event.target.value); setSelected([]) }}>{documents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <input aria-label="搜索目标节点" placeholder="搜索节点或路径…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="knowledge-node-options">{nodes.filter((node) => node.path.toLowerCase().includes(query.toLowerCase())).map((node) => <label key={node.id}><input type="checkbox" checked={selected.includes(node.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, node.id] : ids.filter((id) => id !== node.id))} /><span title={node.path}>{node.path}</span></label>)}</div>
      {!documents.length && <p>请先创建一份思维导图。</p>}{error && <p role="alert" className="paper-dialog-error">{error}</p>}
      <footer><button disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy || !selected.length} onClick={() => void submit()}>{busy ? '关联中…' : `关联到 ${selected.length} 个节点`}</button></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
}
