import { appDatabase, type AppMeta, type StoredAttachmentBlob } from '../../db/appDatabase'
import type { AnnotationNodeRelation, PaperAnnotation } from '../../types/annotation'
import type { DocumentVersion, FolderData, MindMapDocument } from '../../types/mindmap'
import type { NodePaperRelation, Paper, PaperFileCache, PaperReadingState } from '../../types/paper'

const BACKUP_FORMAT = 'researchmind-local-backup'
const BACKUP_VERSION = 1

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

export async function createLocalBackup(): Promise<BackupFile> {
  const rows = await readAllTables()
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

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}

export async function saveBackupFile(backup: BackupFile) {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker
  if (picker) {
    const handle = await picker({
      suggestedName: backup.fileName,
      types: [{ description: 'ResearchMind 完整备份', accept: { 'application/json': ['.researchmind'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(backup.blob)
    await writable.close()
    return
  }
  const url = URL.createObjectURL(backup.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backup.fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
