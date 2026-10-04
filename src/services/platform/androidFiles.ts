interface NativeReply { id: string; ok: boolean; cancelled?: boolean; error?: string }
interface NativeFiles { postMessage: (message: string) => void; onmessage?: (event: { data: string }) => void }
declare global { interface Window { ResearchMindNative?: NativeFiles } }

const replies = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
let initialized = false
let busy = false

export const isAndroidApp = () => window.location.origin === 'https://appassets.androidplatform.net'

export const printAndroidPage = () => request('print')

function request(action: string, fields: Record<string, unknown> = {}) {
  const bridge = window.ResearchMindNative
  if (!bridge || !isAndroidApp()) return Promise.reject(new Error('Android 文件接口不可用。'))
  if (!initialized) {
    bridge.onmessage = (event) => {
      let reply: NativeReply
      try { reply = JSON.parse(event.data) as NativeReply } catch { return }
      const pending = replies.get(reply.id)
      if (!pending) return
      replies.delete(reply.id)
      clearTimeout(pending.timer)
      if (reply.ok) pending.resolve()
      else pending.reject(reply.cancelled ? new DOMException('已取消保存。', 'AbortError') : new Error(reply.error || 'Android 文件保存失败。'))
    }
    initialized = true
  }
  const id = crypto.randomUUID()
  return new Promise<void>((resolve, reject) => {
    // The system file picker can stay open while the user chooses a location.
    const timer = setTimeout(() => { replies.delete(id); reject(new Error('保存等待超时，请重新尝试。')) }, action === 'finish' ? 30 * 60_000 : 60_000)
    replies.set(id, { resolve, reject, timer })
    try { bridge.postMessage(JSON.stringify({ id, action, ...fields })) }
    catch (error) { replies.delete(id); clearTimeout(timer); reject(error instanceof Error ? error : new Error('文件接口失败。')) }
  })
}

export async function saveAndroidFile(blob: Blob, fileName: string) {
  if (busy) throw new Error('另一个文件正在保存，请先完成或取消。')
  if (blob.size > 512 * 1024 * 1024) throw new Error('安卓单次导出上限为 512 MB，请在电脑上备份较大的资料库。')
  busy = true
  try {
    await request('begin', { name: fileName, mime: blob.type.split(';')[0] || 'application/octet-stream', size: blob.size })
    for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 192 * 1024).arrayBuffer())
      let binary = ''
      for (let index = 0; index < bytes.length; index += 32_768) binary += String.fromCharCode(...bytes.subarray(index, index + 32_768))
      await request('chunk', { data: btoa(binary) })
    }
    await request('finish')
  } catch (error) {
    await request('abort').catch(() => undefined)
    throw error
  } finally { busy = false }
}
