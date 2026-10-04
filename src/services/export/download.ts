import { isAndroidApp, saveAndroidFile } from '../platform/androidFiles'

export function downloadBlob(blob: Blob, fileName: string) {
  if (isAndroidApp()) {
    void saveAndroidFile(blob, fileName).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) window.alert(error instanceof Error ? error.message : '文件保存失败。')
    })
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(text: string, fileName: string, mimeType = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mimeType }), fileName)
}
