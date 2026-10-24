let hint: { url: string; token: string } | undefined

export const getPairingHint = () => hint
export const clearPairingHint = () => { hint = undefined }
export function capturePairingHint() {
  const match = /^#researchmind-pair=([A-Za-z0-9_-]{43})$/.exec(window.location.hash)
  if (!match || !(window.location.protocol === 'https:' || window.location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(window.location.hostname))) return
  // Fragments are not sent in HTTP requests. Remove the credential from the
  // visible URL before routing, and require an explicit Connect click.
  try {
    hint = undefined
    const existing = JSON.parse(localStorage.getItem('researchmind-personal-sync-v1') ?? 'null')
    if (existing?.url !== window.location.origin || existing?.token !== match[1]) hint = { url: window.location.origin, token: match[1] }
  } catch { hint = { url: window.location.origin, token: match[1] } }
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
  if (hint) window.dispatchEvent(new Event('researchmind:pairing-hint'))
}
