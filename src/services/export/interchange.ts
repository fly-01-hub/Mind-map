import JSZip from 'jszip'
import type { NodeData } from '../../types/mindmap'
import { createNode } from '../../utils/tree'
import { richTextFromPlain, sanitizeRichText } from '../../utils/richText'

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character]!))

function fromXmlNode(element: Element, textAttribute: string): NodeData {
  const node = createNode(element.getAttribute(textAttribute) || element.getAttribute('title') || '未命名主题')
  return {
    ...node,
    children: Array.from(element.children)
      .filter((child) => child.localName.toLocaleLowerCase() === 'outline' || child.localName.toLocaleLowerCase() === 'node')
      .map((child, index) => ({ ...fromXmlNode(child, textAttribute), order: index })),
  }
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('文件不是有效的 XML 大纲。')
  return document
}

export function treeToOpml(root: NodeData): string {
  const serialize = (node: NodeData): string => `<outline text="${xmlEscape(node.title)}" _note="${xmlEscape(node.note)}">${node.children.map(serialize).join('')}</outline>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>${xmlEscape(root.title)}</title></head><body>${serialize(root)}</body></opml>`
}

export function opmlToTree(xml: string): NodeData {
  const document = parseXml(xml)
  const outline = document.querySelector('opml > body > outline, body > outline')
  if (!outline) throw new Error('OPML 文件中没有找到大纲主题。')
  return fromXmlNode(outline, 'text')
}

export function treeToFreeMind(root: NodeData): string {
  const serialize = (node: NodeData): string => `<node ID="${xmlEscape(node.id)}" TEXT="${xmlEscape(node.title)}">${node.note ? `<richcontent TYPE="NOTE"><html><body>${sanitizeRichText(node.note)}</body></html></richcontent>` : ''}${node.children.map(serialize).join('')}</node>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">${serialize(root)}</map>`
}

export function freeMindToTree(xml: string): NodeData {
  const document = parseXml(xml)
  const root = document.querySelector('map > node')
  if (!root) throw new Error('FreeMind 文件中没有找到中心主题。')
  return fromXmlNode(root, 'TEXT')
}

export function treeToHtml(root: NodeData): string {
  const serialize = (node: NodeData): string => `<li><div class="topic">${node.richText ? sanitizeRichText(node.richText) : richTextFromPlain(node.title)}</div>${node.note ? `<div class="note">${xmlEscape(node.note)}</div>` : ''}${node.children.length ? `<ul>${node.children.map(serialize).join('')}</ul>` : ''}</li>`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${xmlEscape(root.title)}</title><style>body{max-width:900px;margin:48px auto;padding:0 28px;color:#303a34;font:15px/1.65 system-ui,sans-serif}h1{font-size:30px}ul{list-style:none;padding-left:26px}.topic{margin:5px 0}.topic:before{content:'•';margin-right:9px;color:#66806e}.note{margin:3px 0 10px 18px;padding:8px 11px;border-left:2px solid #cbd7ce;color:#68756c;background:#f6f8f6;white-space:pre-wrap}a{color:#396b91}code{padding:1px 4px;background:#f0ece7;border-radius:4px}</style></head><body><h1>${xmlEscape(root.title)}</h1><ul>${root.children.map(serialize).join('')}</ul></body></html>`
}

interface XMindTopic {
  id: string
  class?: string
  title?: string
  notes?: { plain?: { content?: string } }
  children?: { attached?: XMindTopic[]; detached?: XMindTopic[] }
}

function toXMindTopic(node: NodeData): XMindTopic {
  return {
    id: node.id,
    class: 'topic',
    title: node.title,
    notes: node.note ? { plain: { content: node.note } } : undefined,
    children: node.children.length ? { attached: node.children.map(toXMindTopic) } : undefined,
  }
}

function fromXMindTopic(topic: XMindTopic): NodeData {
  const node = createNode(topic.title?.trim() || '未命名主题')
  const children = [...(topic.children?.attached ?? []), ...(topic.children?.detached ?? [])]
  return {
    ...node,
    note: topic.notes?.plain?.content ?? '',
    children: children.map((child, index) => ({ ...fromXMindTopic(child), order: index })),
  }
}

export async function treeToXMind(root: NodeData): Promise<Blob> {
  const zip = new JSZip()
  const sheetId = crypto.randomUUID()
  zip.file('content.json', JSON.stringify([{ id: sheetId, class: 'sheet', title: root.title, rootTopic: toXMindTopic(root) }]))
  zip.file('metadata.json', JSON.stringify({ creator: { name: 'ResearchMind 枝间', version: '1.2' }, activeSheetId: sheetId }))
  zip.file('manifest.json', JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/x-xmind', compression: 'DEFLATE' })
}

export async function xmindToTree(file: Blob): Promise<NodeData> {
  const zip = await JSZip.loadAsync(file)
  const contentFile = zip.file('content.json')
  if (!contentFile) throw new Error('暂不支持这个旧版 XMind 文件；请先在 XMind 中另存为新版 .xmind。')
  const sheets = JSON.parse(await contentFile.async('text')) as Array<{ title?: string; rootTopic?: XMindTopic }>
  const topic = sheets[0]?.rootTopic
  if (!topic) throw new Error('XMind 文件中没有找到中心主题。')
  return fromXMindTopic(topic)
}
