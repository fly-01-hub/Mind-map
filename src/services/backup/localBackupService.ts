import { appDatabase, type AppMeta, type StoredAttachmentBlob } from '../../db/appDatabase'
import { isAndroidApp, saveAndroidFile } from '../platform/androidFiles'
import type { AnnotationNodeRelation, PaperAnnotation } from '../../types/annotation'
import type { DocumentVersion, FolderData, MindMapDocument } from '../../types/mindmap'
import type { NodePaperRelation, Paper, PaperFileCache, PaperReadingState } from '../../types/paper'
import Dexie, { type EntityTable } from 'dexie'

const BACKUP_FORMAT = 'researchmind-local-backup'
const BACKUP_VERSION = 1
type LocalRows = Awaited<ReturnType<typeof readAllTables>>
interface SafetySnapshot { id: string; createdAt: string; rows: LocalRows }
class SafetyDatabase extends Dexie {
  snapshots!: EntityTable<SafetySnapshot, 'id'>
  constructor() { super('researchmind-safety-snapshots', { chromeTransactionDurability: 'strict' }); this.version(1).stores({ snapshots: 'id, createdAt' }) }
}
const safetyDatabase = new SafetyDatabase()

interface SerializedBlob {
  mimeType: string
  base64: string
}

type AttachmentBackupRow = Omit<StoredAttachmentBlob, 'blob'> & { blob: SerializedBlob }
type PaperFileBackupRow = Omit<PaperFileCache, 'blob'> & { blob: SerializedBlob }

interface BackupTables {
  documents: MindMapDocument[]
  folders: FolderData[]
  versions: DocumentVersion[]
  attachmentBlobs: AttachmentBackupRow[]
  papers: Paper[]
  paperFiles: PaperFileBackupRow[]
  paperReadingStates: PaperReadingState[]
  paperAnnotations: PaperAnnotation[]
  nodePaperRelations: NodePaperRelation[]
  annotationNodeRelations: AnnotationNodeRelation[]
  meta: AppMeta[]
}

interface LocalBackupPayload {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  tables: BackupTables
}

export interface BackupFile {
  blob: Blob
  fileName: string
  exportedAt: string
  itemCount: number
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function serializeBlob(blob: Blob): Promise<SerializedBlob> {
  return {
    mimeType: blob.type || 'application/octet-stream',
    base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
  }
}

function deserializeBlob(value: SerializedBlob) {
  return new Blob([base64ToBytes(value.base64)], { type: value.mimeType })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseBackup(text: string): LocalBackupPayload {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('无法读取备份文件：文件内容不是有效的 ResearchMind 备份。')
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || !isRecord(value.tables)) {
    throw new Error('备份文件格式或版本不受支持。')
  }
  const requiredTables: Array<keyof BackupTables> = [
    'documents', 'folders', 'versions', 'attachmentBlobs', 'papers', 'paperFiles',
    'paperReadingStates', 'paperAnnotations', 'nodePaperRelations', 'annotationNodeRelations', 'meta',
  ]
  for (const table of requiredTables) {
    if (!Array.isArray(value.tables[table])) throw new Error(`备份文件缺少 ${table} 数据。`)
  }
  // Reject malformed application records before entering the destructive restore
  // transaction. Optional new annotation fields keep v1 backups compatible.
  const tables = value.tables
  for (const table of requiredTables) {
    const key = table === 'meta' ? 'key' : table === 'paperFiles' || table === 'paperReadingStates' ? 'paperId' : 'id'
    const ids = new Set<string>()
    for (const record of tables[table] as unknown[]) {
      if (!isRecord(record) || typeof record[key] !== 'string' || !record[key] || ids.has(record[key] as string)) throw new Error(`备份中的 ${table} 标识缺失或重复；现有资料未被修改。`)
      ids.add(record[key] as string)
    }
  }
  const validNode = (root: unknown) => {
    const pending = [root]
    const ids = new Set<string>()
    while (pending.length) {
      const node = pending.pop()
      if (!isRecord(node) || typeof node.id !== 'string' || !node.id || ids.has(node.id) || typeof node.title !== 'string' || !Array.isArray(node.children)) return false
      ids.add(node.id)
      pending.push(...node.children)
    }
    return true
  }
  for (const record of [...tables.documents as unknown[], ...tables.versions as unknown[]]) {
    if (!isRecord(record) || typeof record.id !== 'string' || !validNode(record.root)) throw new Error('备份中的文档结构损坏；现有资料未被修改。')
    if (record.linkAliases !== undefined && (!Array.isArray(record.linkAliases) || record.linkAliases.some((name) => typeof name !== 'string'))) throw new Error('备份中的文档旧名称格式损坏；现有资料未被修改。')
  }
  for (const record of tables.paperAnnotations as unknown[]) {
    if (!isRecord(record) || typeof record.id !== 'string' || typeof record.paperId !== 'string' || typeof record.selectedText !== 'string' || typeof record.content !== 'string' || !Number.isInteger(record.pageNumber) || Number(record.pageNumber) < 1 || !['highlight', 'underline', 'note', 'area'].includes(String(record.annotationType)) || !isRecord(record.positionData) || !Array.isArray(record.positionData.rects)) throw new Error('备份中的批注格式损坏；现有资料未被修改。')
    if (record.color !== undefined && !['yellow', 'red', 'green', 'blue', 'purple'].includes(String(record.color))) throw new Error('备份中的批注颜色无效。')
    if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string'))) throw new Error('备份中的批注标签无效。')
    if (record.previewImage !== undefined && (typeof record.previewImage !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(record.previewImage))) throw new Error('备份中的区域预览无效。')
    if (record.areaStyle !== undefined && (!['highlight', 'outline'].includes(String(record.areaStyle)) || record.annotationType !== 'area')) throw new Error('备份中的区域高亮样式无效。')
    for (const rect of record.positionData.rects) {
      if (!isRecord(rect) || ['x', 'y', 'width', 'height'].some((key) => typeof rect[key] !== 'number' || !Number.isFinite(rect[key]) || Number(rect[key]) < 0 || Number(rect[key]) > 1)) throw new Error('备份中的批注坐标无效。')
    }
  }
  return value as unknown as LocalBackupPayload
}

async function readAllTables() {
  return appDatabase.transaction('r', appDatabase.tables, async () => {
    const [
      documents, folders, versions, attachmentBlobs, papers, paperFiles,
      paperReadingStates, paperAnnotations, nodePaperRelations, annotationNodeRelations, meta,
    ] = await Promise.all([
      appDatabase.documents.toArray(), appDatabase.folders.toArray(), appDatabase.versions.toArray(),
      appDatabase.attachmentBlobs.toArray(), appDatabase.papers.toArray(), appDatabase.paperFiles.toArray(),
      appDatabase.paperReadingStates.toArray(), appDatabase.paperAnnotations.toArray(),
      appDatabase.nodePaperRelations.toArray(), appDatabase.annotationNodeRelations.toArray(), appDatabase.meta.toArray(),
    ])
    return {
      documents, folders, versions, attachmentBlobs, papers, paperFiles,
      paperReadingStates, paperAnnotations, nodePaperRelations, annotationNodeRelations, meta,
    }
  })
}

export async function createLocalBackup(current?: Pick<BackupTables, 'documents' | 'folders'>): Promise<BackupFile> {
  const rows = await readAllTables()
  if (current) { rows.documents = structuredClone(current.documents); rows.folders = structuredClone(current.folders) }
  return backupFromRows(rows)
}

async function backupFromRows(rows: LocalRows): Promise<BackupFile> {
  const [attachmentBlobs, paperFiles] = await Promise.all([
    Promise.all(rows.attachmentBlobs.map(async ({ blob, ...row }) => ({ ...row, blob: await serializeBlob(blob) }))),
    Promise.all(rows.paperFiles.map(async ({ blob, ...row }) => ({ ...row, blob: await serializeBlob(blob) }))),
  ])
  const exportedAt = new Date().toISOString()
  const payload: LocalBackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    tables: { ...rows, attachmentBlobs, paperFiles },
  }
  const itemCount = Object.values(payload.tables).reduce((total, table) => total + table.length, 0)
  return {
    blob: new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    fileName: `ResearchMind-backup-${exportedAt.replace(/[:.]/g, '-')}.researchmind`,
    exportedAt,
    itemCount,
  }
}

export async function restoreLocalBackup(file: Blob) {
  const payload = parseBackup(await file.text())
  const attachmentBlobs: StoredAttachmentBlob[] = payload.tables.attachmentBlobs.map(({ blob, ...row }) => ({
    ...row,
    blob: deserializeBlob(blob),
  }))
  const paperFiles: PaperFileCache[] = payload.tables.paperFiles.map(({ blob, ...row }) => ({
    ...row,
    blob: deserializeBlob(blob),
  }))
  // Keep a complete independent local snapshot before any destructive write.
  // If storage is full or this fails, abort without touching the current data.
  const rows = await readAllTables()
  if (Object.entries(rows).some(([table, values]) => table !== 'meta' && values.length > 0)) {
    try {
      await safetyDatabase.transaction('rw', safetyDatabase.snapshots, async () => {
        const previous = await safetyDatabase.snapshots.orderBy('createdAt').toArray()
        if (previous.length >= 2) await safetyDatabase.snapshots.bulkDelete(previous.slice(0, previous.length - 1).map((item) => item.id))
        await safetyDatabase.snapshots.add({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), rows })
      })
    } catch { throw new Error('无法保存恢复前的安全副本，已停止恢复，原有资料未被替换。请检查设备空间并先导出完整备份。') }
  }
  await appDatabase.transaction('rw', appDatabase.tables, async () => {
    await Promise.all(appDatabase.tables.map((table) => table.clear()))
    await Promise.all([
      appDatabase.documents.bulkPut(payload.tables.documents),
      appDatabase.folders.bulkPut(payload.tables.folders),
      appDatabase.versions.bulkPut(payload.tables.versions),
      appDatabase.attachmentBlobs.bulkPut(attachmentBlobs),
      appDatabase.papers.bulkPut(payload.tables.papers),
      appDatabase.paperFiles.bulkPut(paperFiles),
      appDatabase.paperReadingStates.bulkPut(payload.tables.paperReadingStates),
      appDatabase.paperAnnotations.bulkPut(payload.tables.paperAnnotations),
      appDatabase.nodePaperRelations.bulkPut(payload.tables.nodePaperRelations),
      appDatabase.annotationNodeRelations.bulkPut(payload.tables.annotationNodeRelations),
      appDatabase.meta.bulkPut(payload.tables.meta),
    ])
    await appDatabase.meta.put({ key: 'last-restored-at', value: new Date().toISOString() })
  })

  return {
    exportedAt: payload.exportedAt,
    documentCount: payload.tables.documents.length,
    paperCount: payload.tables.papers.length,
  }
}

export async function latestSafetyBackup(): Promise<BackupFile | undefined> {
  const snapshot = await safetyDatabase.snapshots.orderBy('createdAt').reverse().first()
  if (!snapshot) return
  const backup = await backupFromRows(snapshot.rows)
  return { ...backup, fileName: `ResearchMind-before-restore-${snapshot.createdAt.replace(/[:.]/g, '-')}.researchmind` }
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}

export async function saveBackupFile(backup: BackupFile) {
  if (isAndroidApp()) { await saveAndroidFile(backup.blob, backup.fileName); return 'saved' as const }
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker
  if (picker) {
    const handle = await picker({
      suggestedName: backup.fileName,
      types: [{ description: 'ResearchMind 完整备份', accept: { 'application/json': ['.researchmind'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(backup.blob)
    await writable.close()
    return 'saved' as const
  }
  const url = URL.createObjectURL(backup.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backup.fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'downloaded' as const
}
