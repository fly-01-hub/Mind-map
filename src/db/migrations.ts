import type { Attachment, MindMapDocument, NodeData, NodeStyle, TaskStatus } from '../types/mindmap'

type LegacyRecord = Record<string, unknown>

const taskStatuses = new Set<TaskStatus>(['none', 'todo', 'doing', 'done'])

const isRecord = (value: unknown): value is LegacyRecord => typeof value === 'object' && value !== null
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const timestamp = (value: unknown, fallback: string) => text(value, fallback)

function migrateAttachment(value: unknown, now: string): Attachment | undefined {
  if (!isRecord(value)) return
  const id = text(value.id)
  const fileName = text(value.fileName)
  if (!id || !fileName) return
  return {
    id,
    fileName,
    mimeType: text(value.mimeType, 'application/octet-stream'),
    size: typeof value.size === 'number' ? value.size : 0,
    storagePath: text(value.storagePath, `local://${id}`),
    createdAt: timestamp(value.createdAt, now),
    pageNumber: typeof value.pageNumber === 'number' ? value.pageNumber : undefined,
    quote: typeof value.quote === 'string' ? value.quote : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : undefined,
  }
}

/** Normalizes documents saved by older app versions without trusting their shape. */
export function migrateNodeData(value: unknown, order = 0, now = new Date().toISOString()): NodeData {
  const source = isRecord(value) ? value : {}
  const children = Array.isArray(source.children)
    ? source.children.map((child, index) => migrateNodeData(child, index, now))
    : []
  const rawStyle = isRecord(source.style) ? source.style : {}
  const style: NodeStyle = {
    color: typeof rawStyle.color === 'string' ? rawStyle.color : undefined,
    background: typeof rawStyle.background === 'string' ? rawStyle.background : undefined,
    fontWeight: typeof rawStyle.fontWeight === 'string' ? rawStyle.fontWeight : undefined,
    fontStyle: typeof rawStyle.fontStyle === 'string' ? rawStyle.fontStyle : undefined,
    textDecoration: typeof rawStyle.textDecoration === 'string' ? rawStyle.textDecoration : undefined,
  }
  const rawStatus = text(source.taskStatus, 'none') as TaskStatus
  return {
    id: text(source.id) || crypto.randomUUID(),
    title: text(source.title, text(source.text, '未命名主题')),
    children,
    collapsed: source.collapsed === true,
    order: typeof source.order === 'number' ? source.order : order,
    createdAt: timestamp(source.createdAt, now),
    updatedAt: timestamp(source.updatedAt, now),
    style,
    tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    taskStatus: taskStatuses.has(rawStatus) ? rawStatus : 'none',
    hyperlink: typeof source.hyperlink === 'string' ? source.hyperlink : undefined,
    note: text(source.note),
    code: typeof source.code === 'string' ? source.code : undefined,
    formula: typeof source.formula === 'string' ? source.formula : undefined,
    icon: typeof source.icon === 'string' ? source.icon : undefined,
    image: isRecord(source.image) && typeof source.image.url === 'string' ? {
      url: source.image.url,
      width: typeof source.image.width === 'number' ? source.image.width : 320,
      height: typeof source.image.height === 'number' ? source.image.height : 180,
    } : undefined,
    attachments: Array.isArray(source.attachments)
      ? source.attachments.map((item) => migrateAttachment(item, now)).filter((item): item is Attachment => Boolean(item))
      : [],
  }
}

export function migrateDocument(value: unknown): MindMapDocument | undefined {
  if (!isRecord(value)) return
  const id = text(value.id)
  if (!id) return
  const now = new Date().toISOString()
  const title = text(value.title, '未命名思维导图')
  return {
    id,
    title,
    root: migrateNodeData(value.root ?? { title }, 0, now),
    folderId: typeof value.folderId === 'string' ? value.folderId : undefined,
    isFavorite: value.isFavorite === true,
    version: typeof value.version === 'number' && value.version > 0 ? value.version : 1,
    createdAt: timestamp(value.createdAt, now),
    updatedAt: timestamp(value.updatedAt, now),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : undefined,
  }
}
