import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { attachmentRepository } from '../../repositories/attachmentRepository'
import type { Attachment } from '../../types/mindmap'
import { downloadBlob } from '../../services/export/download'

export function AttachmentViewer({ attachment, onClose }: { attachment?: Attachment; onClose: () => void }) {
  const [url, setUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    let objectUrl: string | undefined
    if (!attachment) return
    void attachmentRepository.getBlob(attachment).then((stored) => {
      if (!stored) return
      setBlob(stored)
      objectUrl = URL.createObjectURL(stored)
      setUrl(objectUrl)
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(undefined); setBlob(undefined) }
  }, [attachment])

  const pdfUrl = url ? `${url}#page=${page}&zoom=${zoom}&toolbar=0&navpanes=0` : undefined

  return (
    <Dialog.Root open={Boolean(attachment)} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="attachment-dialog" aria-describedby={undefined}>
          <header className="viewer-toolbar">
            <Dialog.Title>{attachment?.fileName}</Dialog.Title>
            <div className="viewer-spacer" />
            {attachment?.mimeType === 'application/pdf' && <>
              <button className="icon-button" aria-label="上一页" onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button>
              <span className="viewer-page">第 {page} 页</span>
              <button className="icon-button" aria-label="下一页" onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button>
              <span className="viewer-separator" />
              <button className="icon-button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(50, value - 25))}><Minus size={17} /></button>
              <span className="viewer-page">{zoom}%</span>
              <button className="icon-button" aria-label="放大" onClick={() => setZoom((value) => Math.min(250, value + 25))}><Plus size={17} /></button>
            </>}
            <button className="icon-button" aria-label="下载" disabled={!blob} onClick={() => blob && attachment && downloadBlob(blob, attachment.fileName)}><Download size={17} /></button>
            <Dialog.Close asChild><button className="icon-button" aria-label="关闭预览"><X size={18} /></button></Dialog.Close>
          </header>
          <div className="viewer-content">
            {!url && <div className="viewer-loading">正在读取本地附件…</div>}
            {url && attachment?.mimeType === 'application/pdf' && <iframe title={attachment.fileName} src={pdfUrl} />}
            {url && attachment?.mimeType.startsWith('image/') && <img src={url} alt={attachment.fileName} />}
            {url && attachment && attachment.mimeType !== 'application/pdf' && !attachment.mimeType.startsWith('image/') && <div className="viewer-loading"><strong>{attachment.fileName}</strong><span>此文件没有浏览器预览，仍可下载。</span></div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
