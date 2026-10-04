import type { MindMapDocument, NodeData } from '../types/mindmap'
import { plainTextFromRichText, sanitizeRichText } from './richText'

export interface WikiLink { name: string; start: number; end: number; contentStart: number; contentEnd: number }
export const documentNameKey = (name: string) => name.trim().normalize('NFC').toLowerCase()

// Code and escaped brackets are literal examples, not document references.
export function parseWikiLinks(text: string): WikiLink[] {
  const ignored = [...text.matchAll(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`+[^`\n]*`+/g)]
    .map((match) => [match.index!, match.index! + match[0].length])
  return [...text.matchAll(/\[\[([^\]\r\n[]+)\]\]/g)].flatMap((match) => {
    const start = match.index!
    const end = start + match[0].length
    const slashes = text.slice(0, start).match(/\\+$/)?.[0].length ?? 0
    const name = match[1].trim()
    if (!name || slashes % 2 || ignored.some(([from, to]) => start < to && end > from)) return []
    return [{ name, start, end, contentStart: start + 2, contentEnd: end - 2 }]
  })
}

export function matchingDocuments(documents: MindMapDocument[], name: string) {
  const key = documentNameKey(name)
  return documents.filter((item) => !item.deletedAt && (documentNameKey(item.title) === key
    || item.linkAliases?.some((alias) => documentNameKey(alias) === key)))
}

export function uniqueDocumentName(documents: MindMapDocument[], proposed: string, exceptId?: string) {
  const title = proposed.trim() || '未命名思维导图'
  const occupied = (value: string) => matchingDocuments(documents, value).some((item) => item.id !== exceptId)
  if (!occupied(title)) return title
  let number = 2
  while (occupied(`${title} (${number})`)) number++
  return `${title} (${number})`
}

export function replaceWikiLinks(text: string, oldName: string, newName: string) {
  const links = parseWikiLinks(text).filter((link) => documentNameKey(link.name) === documentNameKey(oldName))
  let result = text
  for (const link of links.reverse()) result = result.slice(0, link.contentStart) + newName + result.slice(link.contentEnd)
  return result
}

interface TextPart { node: Text; start: number; end: number; literal: boolean }
function textParts(element: HTMLElement) {
  const parts: TextPart[] = []
  let text = ''
  const visit = (node: Node, literal = false) => {
    if (node instanceof Text) {
      const start = text.length
      text += node.data
      parts.push({ node, start, end: text.length, literal })
    } else if (node instanceof HTMLBRElement) text += '\n'
    else {
      const skip = literal || (node instanceof HTMLElement && !!node.matches('code, pre, a, [data-cloze]'))
      node.childNodes.forEach((child) => visit(child, skip))
    }
  }
  visit(element)
  return { text, parts }
}

export function wikiLinkRanges(element: HTMLElement) {
  const { text, parts } = textParts(element)
  return parseWikiLinks(text).flatMap((link) => {
    if (parts.some((part) => part.literal && part.start < link.end && part.end > link.start)) return []
    const first = parts.find((part) => part.end > link.contentStart)
    const last = parts.find((part) => part.end >= link.contentEnd && part.start < link.contentEnd)
    if (!first || !last) return []
    const range = document.createRange()
    range.setStart(first.node, Math.max(0, link.contentStart - first.start))
    range.setEnd(last.node, link.contentEnd - last.start)
    return [{ ...link, range }]
  })
}

export function wikiLinkAtPoint(element: HTMLElement, x: number, y: number) {
  return wikiLinkRanges(element).find((link) => Array.from(link.range.getClientRects())
    .some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom))?.name
}

// CSS Highlights paint live editors without rewriting their DOM, caret, IME or undo history.
const editors = new Map<HTMLElement, Range[]>()
function refreshHighlights() {
  const api = CSS as typeof CSS & { highlights?: Map<string, unknown> }
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (!api.highlights || !HighlightClass) return
  for (const element of editors.keys()) if (!element.isConnected) editors.delete(element)
  api.highlights.set('document-links', new HighlightClass(...Array.from(editors.values()).flat()))
}
export function highlightWikiEditor(element: HTMLElement) {
  editors.set(element, wikiLinkRanges(element).map((link) => link.range))
  refreshHighlights()
}
export function clearWikiEditor(element: HTMLElement) {
  editors.delete(element)
  refreshHighlights()
}

export function decorateWikiLinks(html: string, documents: MindMapDocument[]): string {
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichText(html)
  const links = wikiLinkRanges(container)
  const { parts } = textParts(container)
  // Each styled text fragment gets a wrapper, preserving all existing formatting.
  for (const part of parts) {
    const overlaps = links.filter((link) => link.contentStart < part.end && link.contentEnd > part.start)
    if (!overlaps.length) continue
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const link of overlaps) {
      const from = Math.max(link.contentStart - part.start, 0)
      const to = Math.min(link.contentEnd - part.start, part.node.length)
      fragment.append(part.node.data.slice(offset, from))
      const span = document.createElement('span')
      const targets = matchingDocuments(documents, link.name)
      span.className = `wiki-link${targets.length ? '' : ' is-missing'}`
      span.dataset.wikiName = link.name
      span.setAttribute('role', 'link')
      span.tabIndex = 0
      span.title = targets.length ? `双击打开文档「${link.name}」` : `双击新建文档「${link.name}」`
      span.textContent = part.node.data.slice(from, to)
      fragment.append(span)
      offset = to
    }
    fragment.append(part.node.data.slice(offset))
    part.node.replaceWith(fragment)
  }
  return container.innerHTML
}

export function replaceRichWikiLinks(html: string, oldName: string, newName: string) {
  if (typeof document === 'undefined') return replaceWikiLinks(html, oldName, newName)
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichText(html)
  for (const link of wikiLinkRanges(container).reverse()) {
    if (documentNameKey(link.name) !== documentNameKey(oldName)) continue
    link.range.deleteContents()
    link.range.insertNode(document.createTextNode(newName))
  }
  return sanitizeRichText(container.innerHTML)
}

export function rewriteTreeLinks(root: NodeData, oldName: string, newName: string): NodeData {
  const richText = root.richText && replaceRichWikiLinks(root.richText, oldName, newName)
  const title = richText ? plainTextFromRichText(richText) : replaceWikiLinks(root.title, oldName, newName)
  const note = replaceWikiLinks(root.note, oldName, newName)
  const children = root.children.map((child) => rewriteTreeLinks(child, oldName, newName))
  if (title === root.title && richText === root.richText && note === root.note && children.every((child, index) => child === root.children[index])) return root
  return { ...root, title, richText, note, children, updatedAt: new Date().toISOString() }
}

export interface Backlink { documentId: string; documentTitle: string; nodeId: string; nodeTitle: string; note: boolean }
export function findBacklinks(documents: MindMapDocument[], target: MindMapDocument): Backlink[] {
  const names = new Set([target.title, ...(target.linkAliases ?? [])].map(documentNameKey))
  const result: Backlink[] = []
  for (const source of documents) {
    if (source.deletedAt) continue
    const visit = (node: NodeData) => {
      const titleLinks = node.richText && typeof document !== 'undefined'
        ? (() => { const element = document.createElement('div'); element.innerHTML = sanitizeRichText(node.richText!); return wikiLinkRanges(element) })()
        : parseWikiLinks(node.title)
      const titleMatch = titleLinks.some((link) => names.has(documentNameKey(link.name)))
      const noteMatch = parseWikiLinks(node.note).some((link) => names.has(documentNameKey(link.name)))
      if (titleMatch || noteMatch) result.push({ documentId: source.id, documentTitle: source.title, nodeId: node.id, nodeTitle: node.title, note: !titleMatch })
      node.children.forEach(visit)
    }
    visit(source.root)
  }
  return result
}
