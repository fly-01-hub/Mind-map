const escapeMap: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => escapeMap[character])
}

export function richTextFromPlain(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>')
}

function safeLink(value: string | null): string | undefined {
  if (!value) return
  const trimmed = value.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
}

function safeColor(value: string): string | undefined {
  const trimmed = value.trim()
  if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(trimmed)) return trimmed
}

export function sanitizeRichText(html: string): string {
  // Rich text is sanitized at every browser-side ingress (editing, Markdown
  // import, and map conversion). Keeping the already-sanitized representation
  // intact in non-DOM contexts also makes tree operations deterministic in
  // unit tests and desktop background code.
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html

  const serializeChildren = (nodes: NodeListOf<ChildNode>): string => {
    let result = ''
    for (const node of nodes) {
      // Browser contenteditable uses block elements for new lines, including
      // "first<div>second</div>". Keep the boundary before each block as well.
      if (node instanceof HTMLElement && ['div', 'p'].includes(node.tagName.toLowerCase()) && result && !result.endsWith('<br>')) result += '<br>'
      result += serialize(node)
    }
    return result
  }
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (!(node instanceof HTMLElement)) return ''
    if (['script', 'style', 'template', 'iframe', 'object', 'embed'].includes(node.tagName.toLowerCase())) return ''
    const children = serializeChildren(node.childNodes)
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return '<br>'
    if (tag === 'b' || tag === 'strong') return `<strong>${children}</strong>`
    if (tag === 'i' || tag === 'em') return `<em>${children}</em>`
    if (tag === 'u') return `<u>${children}</u>`
    if (tag === 's' || tag === 'strike' || tag === 'del') return `<s>${children}</s>`
    if (tag === 'code') return `<code>${children}</code>`
    if (tag === 'a') {
      const href = safeLink(node.getAttribute('href'))
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${children}</a>` : children
    }
    if (tag === 'font') {
      const color = safeColor(node.getAttribute('color') ?? '')
      return color ? `<span style="color:${color}">${children}</span>` : children
    }
    if (tag === 'span') {
      const styles: string[] = []
      const color = safeColor(node.style.color)
      const background = safeColor(node.style.backgroundColor)
      if (color) styles.push(`color:${color}`)
      if (background) styles.push(`background-color:${background}`)
      const style = styles.length ? ` style="${styles.join(';')}"` : ''
      const cloze = node.dataset.cloze === 'true' ? ' data-cloze="true"' : ''
      return style || cloze ? `<span${style}${cloze}>${children}</span>` : children
    }
    if (tag === 'div' || tag === 'p') return `${children}<br>`
    return children
  }

  return serializeChildren(template.content.childNodes).replace(/(?:<br>)+$/, '')
}

export function plainTextFromRichText(html: string): string {
  if (typeof document === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
  }
  const template = document.createElement('template')
  template.innerHTML = sanitizeRichText(html)
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node instanceof HTMLBRElement) return '\n'
    return Array.from(node.childNodes).map(read).join('')
  }
  return Array.from(template.content.childNodes).map(read).join('')
}

export function compactRichText(html: string, plainText: string): string | undefined {
  const sanitized = sanitizeRichText(html)
  return sanitized === richTextFromPlain(plainText) ? undefined : sanitized
}

export function combineRichText(leftHtml: string | undefined, leftText: string, rightHtml: string | undefined, rightText: string): string | undefined {
  const combined = `${leftHtml ?? richTextFromPlain(leftText)}${rightHtml ?? richTextFromPlain(rightText)}`
  return compactRichText(combined, `${leftText}${rightText}`)
}
