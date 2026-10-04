import * as Dialog from '@radix-ui/react-dialog'
import { Network, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import type { PaperAnnotation } from '../../types/annotation'
import type { NodeData } from '../../types/mindmap'
import type { Paper } from '../../types/paper'

interface CreateNodeDialogProps {
  paper: Paper
  annotation: PaperAnnotation
  defaultDocumentId?: string
  defaultNodeId?: string
  onClose: () => void
  onConfirm: (value: { documentId: string; parentNodeId: string; title: string; note: string }) => Promise<void>
}

function flattenNodes(node: NodeData, depth = 0): Array<{ id: string; title: string; depth: number }> {
  return [{ id: node.id, title: node.title, depth }, ...node.children.flatMap((child) => flattenNodes(child, depth + 1))]
}

export function CreateNodeFromAnnotationDialog({ paper, annotation, defaultDocumentId, defaultNodeId, onClose, onConfirm }: CreateNodeDialogProps) {
  const allDocuments = useDocumentStore((state) => state.documents)
  const documents = useMemo(() => allDocuments.filter((document) => !document.deletedAt), [allDocuments])
  const initialDocument = documents.find((document) => document.id === defaultDocumentId) ?? documents[0]
  const initialNodes = initialDocument ? flattenNodes(initialDocument.root) : []
  const [documentId, setDocumentId] = useState(initialDocument?.id ?? '')
  const [parentNodeId, setParentNodeId] = useState(initialNodes.some((node) => node.id === defaultNodeId) ? defaultNodeId! : initialNodes[0]?.id ?? '')
  const [title, setTitle] = useState(annotation.selectedText.replace(/\s+/g, ' ').trim().slice(0, 100))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const targetDocument = documents.find((document) => document.id === documentId)
  const nodeOptions = useMemo(() => targetDocument ? flattenNodes(targetDocument.root) : [], [targetDocument])

  const changeDocument = (nextId: string) => {
    setDocumentId(nextId)
    const nextDocument = documents.find((document) => document.id === nextId)
    setParentNodeId(nextDocument?.root.id ?? '')
  }
  const submit = async () => {
    if (!documentId || !parentNodeId || !title.trim()) return
    setSaving(true)
    setError('')
    try {
      await onConfirm({ documentId, parentNodeId, title: title.trim(), note: note.trim() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '节点创建失败。')
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="standard-dialog create-paper-node-dialog">
          <header><div><p className="eyebrow">Paper to mind map</p><Dialog.Title>生成思维导图节点</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close></header>
          <Dialog.Description>把选中的论文内容添加到指定思维导图节点下，并保留完整来源。</Dialog.Description>
          <blockquote>{annotation.selectedText}</blockquote>
          {annotation.previewImage && <img className="generation-area-preview" src={annotation.previewImage} alt="来源区域预览" />}
          <div className="paper-node-form">
            <label>节点标题<input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
            <label>添加到思维导图<select value={documentId} onChange={(event) => changeDocument(event.target.value)}>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
            <label>父节点<select value={parentNodeId} onChange={(event) => setParentNodeId(event.target.value)}>{nodeOptions.map((node) => <option key={node.id} value={node.id}>{`${'　'.repeat(node.depth)}${node.depth ? '└ ' : ''}${node.title}`}</option>)}</select></label>
            <label>我的笔记<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充你的理解、疑问或结论…" /></label>
          </div>
          <div className="paper-node-source"><span>来源</span><strong>{paper.title}</strong><span>Page {annotation.pageNumber}</span></div>
          {error && <p className="paper-dialog-error">{error}</p>}
          <footer><button className="secondary-button" disabled={saving} onClick={onClose}>取消</button><button className="primary-button" disabled={saving || !documentId || !parentNodeId || !title.trim()} onClick={() => void submit()}><Network size={15} />{saving ? '正在创建…' : '创建节点'}</button></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
