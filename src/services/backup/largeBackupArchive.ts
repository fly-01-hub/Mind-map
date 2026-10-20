import JSZip from 'jszip'
import type { BackupFormat, LocalRows } from './localBackupService'

const archiveFormat = 'researchmind-binary-backup'
type BinaryDescriptor = { file: string; bytes: number; sha256: string; mimeType: string }
export interface BinaryManifest {
  format: typeof archiveFormat
  version: 2
  sourceFormat: BackupFormat
  exportedAt: string
  tables: Record<string, unknown[]>
  integrity: { algorithm: 'SHA-256'; digest: string }
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
function manifestBytes(manifest: Omit<BinaryManifest, 'integrity'>) {
  return new TextEncoder().encode(JSON.stringify({ format: manifest.format, version: manifest.version, sourceFormat: manifest.sourceFormat, exportedAt: manifest.exportedAt, tables: manifest.tables }))
}

// A large library cannot be base64-encoded into one JavaScript string. Keep
// binaries as separate ZIP entries and hash each file before any restore write.
export async function createBinaryBackup(rows: LocalRows, sourceFormat: BackupFormat) {
  const zip = new JSZip()
  const tables: Record<string, unknown[]> = { ...rows, attachmentBlobs: [], paperFiles: [] }
  for (const name of ['attachmentBlobs', 'paperFiles'] as const) {
    for (const [index, { blob, ...row }] of rows[name].entries()) {
      const file = `binaries/${name}-${index}.bin`
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const descriptor: BinaryDescriptor = { file, bytes: bytes.byteLength, sha256: await sha256(bytes), mimeType: blob.type || 'application/octet-stream' }
      tables[name].push({ ...row, blob: descriptor })
      zip.file(file, bytes, { compression: 'STORE' })
    }
  }
  const base: Omit<BinaryManifest, 'integrity'> = { format: archiveFormat, version: 2, sourceFormat, exportedAt: new Date().toISOString(), tables }
  const manifest: BinaryManifest = { ...base, integrity: { algorithm: 'SHA-256', digest: await sha256(manifestBytes(base)) } }
  zip.file('manifest.json', JSON.stringify(manifest))
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array', streamFiles: true, compression: 'STORE' }))
  const itemCount = Object.values(rows).reduce((sum, values) => sum + values.length, 0)
  return { blob: new Blob([bytes], { type: 'application/zip' }), exportedAt: base.exportedAt, itemCount,
    fileName: `${sourceFormat === 'researchmind-local-backup' ? 'ResearchMind-backup' : 'ResearchMind-selected'}-${base.exportedAt.replace(/[:.]/g, '-')}.${sourceFormat === 'researchmind-local-backup' ? 'researchmind' : 'rmpart'}` }
}

export async function readBinaryBackup(file: Blob, formats: BackupFormat[], validateTables: (text: string, formats: BackupFormat[]) => unknown) {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()) } catch { throw new Error('无法读取备份文件：备份包损坏。') }
  const entry = zip.file('manifest.json')
  if (!entry) throw new Error('备份包缺少清单。')
  const text = await entry.async('string')
  if (text.length > 256 * 1024 * 1024) throw new Error('备份清单过大。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('备份清单损坏。') }
  if (!record(value) || value.format !== archiveFormat || value.version !== 2 || !formats.includes(value.sourceFormat as BackupFormat)
    || typeof value.exportedAt !== 'string' || !record(value.tables) || !record(value.integrity) || value.integrity.algorithm !== 'SHA-256'
    || typeof value.integrity.digest !== 'string') throw new Error('备份文件格式或版本不受支持。')
  const manifest = value as unknown as BinaryManifest
  if (await sha256(manifestBytes(manifest)) !== manifest.integrity.digest) throw new Error('备份完整性校验失败；原有资料未被替换。')
  // Reuse the same IDs, node-tree and annotation validation as legacy backups.
  validateTables(JSON.stringify({ format: manifest.sourceFormat, version: 1, exportedAt: manifest.exportedAt, tables: manifest.tables }), formats)
  const tables = { ...manifest.tables } as unknown as LocalRows
  const paths = new Set<string>()
  let totalBytes = 0
  for (const name of ['attachmentBlobs', 'paperFiles'] as const) {
    const restored = []
    for (const row of manifest.tables[name]) {
      if (!record(row) || !record(row.blob)) throw new Error('备份中的文件描述无效。')
      const descriptor = row.blob
      if (typeof descriptor.file !== 'string' || !/^binaries\/(?:attachmentBlobs|paperFiles)-\d+\.bin$/.test(descriptor.file)
        || paths.has(descriptor.file) || !Number.isSafeInteger(descriptor.bytes) || Number(descriptor.bytes) < 0 || Number(descriptor.bytes) > 1024 ** 3
        || typeof descriptor.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(descriptor.sha256) || typeof descriptor.mimeType !== 'string') throw new Error('备份中的文件描述无效。')
      paths.add(descriptor.file)
      totalBytes += Number(descriptor.bytes)
      if (totalBytes > 4 * 1024 ** 3) throw new Error('备份中的文件总量过大，请使用部分导图备份。')
      const binary = zip.file(descriptor.file)
      if (!binary) throw new Error('备份缺少论文或附件；原有资料未被替换。')
      const bytes = new Uint8Array(await binary.async('uint8array'))
      if (bytes.byteLength !== descriptor.bytes || await sha256(bytes) !== descriptor.sha256) throw new Error('论文或附件完整性校验失败；原有资料未被替换。')
      restored.push({ ...row, blob: new Blob([bytes], { type: descriptor.mimeType }) })
    }
    // Both arrays share this shape at runtime; metadata was validated above.
    Object.assign(tables, { [name]: restored })
  }
  return { rows: tables, exportedAt: manifest.exportedAt, sourceId: manifest.integrity.digest }
}
