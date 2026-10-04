import { useMemo } from 'react'
import { Link2, X } from 'lucide-react'
import type { MindMapDocument } from '../../types/mindmap'
import { findBacklinks } from '../../utils/wikiLinks'

export function DocumentLinks({ documents, document, onGoToNode, onClose, overlay = false }: {
  documents: MindMapDocument[]; document: MindMapDocument
  onGoToNode: (documentId: string, nodeId: string) => void
  onClose?: () => void; overlay?: boolean
}) {
  const backlinks = useMemo(() => findBacklinks(documents, document), [documents, document])
  return <section className={`document-backlinks ${overlay ? 'is-overlay' : ''}`} aria-label="文档反向引用">
    <header><strong><Link2 size={15} />反向引用 <span>{backlinks.length}</span></strong>{onClose && <button className="icon-button" aria-label="关闭反向引用" onClick={onClose}><X size={15} /></button>}</header>
    <p>输入 [[文档名称]] 建立链接，双击高亮文字打开或新建文档。</p>
    <div className="backlink-list">{backlinks.map((link) => <button key={`${link.documentId}:${link.nodeId}`} onClick={() => onGoToNode(link.documentId, link.nodeId)}>
      <strong>{link.documentTitle}</strong><span>{link.note ? '笔记 · ' : ''}{link.nodeTitle || '空主题'}</span>
    </button>)}</div>
    {!backlinks.length && <div className="backlink-empty">还没有节点引用此文档。</div>}
  </section>
}
