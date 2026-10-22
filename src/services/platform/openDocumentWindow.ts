export function openDocumentWindow(documentId?: string) {
  if (!navigator.locks) {
    window.alert('当前浏览器无法安全协调多个编辑窗口。请使用支持多窗口编辑的最新版 Edge 或 Chrome。')
    return
  }
  const route = documentId ? `/map/${encodeURIComponent(documentId)}` : '/library'
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (import.meta.env.MODE === 'pages') url.hash = route
  else url.pathname = route
  // This runs directly in the click handler so popup permissions and the
  // current browser profile are preserved. No copy or new data space is made.
  window.open(url.href, '_blank', 'popup=yes,noopener,width=1280,height=900')
}
