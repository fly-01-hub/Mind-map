import type { NodeData } from '../../types/mindmap'
import { createNode, normalizeOrders } from '../../utils/tree'
import { sanitizeRichText } from '../../utils/richText'

interface NodeMetadata {
  tags: string[]
  note: string
  hyperlink?: string
  taskStatus: NodeData['taskStatus']
  code?: string
  formula?: string
  style: NodeData['style']
  richText?: string
  table?: NodeData['table']
}

export interface MarkdownPaperSource {
  paperTitle: string
  pageNumber: number
  selectedText: string
  note: string
}

export type MarkdownPaperSources = Record<string, MarkdownPaperSource[]>

function label(node: NodeData) {
  const task = node.taskStatus === 'done' ? '[x] ' : node.taskStatus === 'todo' || node.taskStatus === 'doing' ? '[ ] ' : ''
  const title = node.hyperlink ? `[${node.title}](${node.hyperlink})` : node.title
  const tags = node.tags.map((tag) => ` #${tag.replace(/\s+/g, '-')}`).join('')
  return `${task}${title}${tags}`
}

function metadataLine(node: NodeData) {
  const metadata: NodeMetadata = {
    tags: node.tags, note: node.note, hyperlink: node.hyperlink,
    taskStatus: node.taskStatus, code: node.code, formula: node.formula, style: node.style, richText: node.richText, table: node.table,
  }
  return `<!-- zhijian-node:${encodeURIComponent(JSON.stringify(metadata))} -->`
}

function writePaperSources(nodeId: string, indent: string, lines: string[], paperSources?: MarkdownPaperSources) {
  for (const source of paperSources?.[nodeId] ?? []) {
    lines.push(`${indent}> 来源：${source.paperTitle} · Page ${source.pageNumber}`)
    lines.push(`${indent}> 引用：“${source.selectedText.replace(/\s+/g, ' ').trim()}”`)
    if (source.note.trim()) lines.push(`${indent}> 我的笔记：${source.note.replace(/\s+/g, ' ').trim()}`)
  }
}

function writeChildren(nodes: NodeData[], depth: number, lines: string[], paperSources?: MarkdownPaperSources) {
  for (const node of nodes) {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}- ${label(node)}`)
    lines.push(`${indent}  ${metadataLine(node)}`)
    writePaperSources(node.id, `${indent}  `, lines, paperSources)
    writeChildren(node.children, depth + 1, lines, paperSources)
  }
}

export function treeToMarkdown(root: NodeData, paperSources?: MarkdownPaperSources) {
  const lines = [`# ${label(root)}`, metadataLine(root), '']
  writePaperSources(root.id, '', lines, paperSources)
  writeChildren(root.children, 0, lines, paperSources)
  return `${lines.join('\n').trim()}\n`
}

function parseLabel(raw: string) {
  let value = raw.trim()
  let taskStatus: NodeData['taskStatus'] = 'none'
  if (/^\[[xX]\]\s+/.test(value)) { taskStatus = 'done'; value = value.replace(/^\[[xX]\]\s+/, '') }
  else if (/^\[ \]\s+/.test(value)) { taskStatus = 'todo'; value = value.replace(/^\[ \]\s+/, '') }
  const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)/)
  const hyperlink = link?.[2]
  if (link) value = `${link[1]}${value.slice(link[0].length)}`
  const tags = [...value.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((match) => match[1])
  value = value.replace(/(?:^|\s)#[^\s#]+/g, '').trim()
  return { title: value || '未命名主题', hyperlink, tags, taskStatus }
}

function applyMetadata(node: NodeData, encoded: string) {
  try {
    const metadata = JSON.parse(decodeURIComponent(encoded)) as Partial<NodeMetadata>
    Object.assign(node, {
      tags: metadata.tags ?? node.tags,
      note: metadata.note ?? node.note,
      hyperlink: metadata.hyperlink ?? node.hyperlink,
      taskStatus: metadata.taskStatus ?? node.taskStatus,
      code: metadata.code,
      formula: metadata.formula,
      style: metadata.style ?? node.style,
      richText: metadata.richText ? sanitizeRichText(metadata.richText) : undefined,
      table: metadata.table,
    })
  } catch {
    // Invalid optional metadata never prevents importing the visible outline.
  }
}

export function markdownToTree(markdown: string): NodeData {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const heading = lines.find((line) => /^#\s+/.test(line))
  const parsedRoot = parseLabel(heading?.replace(/^#\s+/, '') ?? '导入的思维导图')
  const root = { ...createNode(parsedRoot.title), ...parsedRoot }
  const stack: NodeData[] = [root]
  let latest = root

  for (const line of lines) {
    const meta = line.trim().match(/^<!--\s*zhijian-node:(.+)\s*-->$/)
    if (meta) { applyMetadata(latest, meta[1]); continue }
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/)
    if (!bullet) continue
    const depth = Math.floor(bullet[1].replace(/\t/g, '  ').length / 2) + 1
    const parsed = parseLabel(bullet[2])
    const node = { ...createNode(parsed.title), ...parsed }
    const parent = stack[Math.max(0, depth - 1)] ?? root
    parent.children.push(node)
    stack[depth] = node
    stack.length = depth + 1
    latest = node
  }
  return normalizeOrders(root)
}
