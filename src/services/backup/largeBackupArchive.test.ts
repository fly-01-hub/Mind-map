import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { appDatabase } from '../../db/appDatabase'
import { createNode } from '../../utils/tree'
import { createBinaryBackup } from './largeBackupArchive'
import { readBackupRows, restoreLocalBackup, type LocalRows } from './localBackupService'

function fixture(): LocalRows {
  const root = createNode('含历史和论文的旧导图'), now = root.createdAt
  return {
    documents: [{ id: 'original', title: root.title, root, version: 3, isFavorite: true, createdAt: now, updatedAt: now }],
    folders: [], versions: [{ id: 'history', documentId: 'original', title: root.title, root, version: 2, createdAt: now, reason: 'important' }],
    attachmentBlobs: [{ id: 'attachment', documentId: 'original', nodeId: root.id, blob: new Blob(['附件'], { type: 'text/plain' }), createdAt: now }],
    papers: [{ id: 'paper', title: '论文', userId: 'local', fileName: 'paper.pdf', filePath: 'local://paper', fileSize: 8, pageCount: 1, checksum: 'kept', createdAt: now, updatedAt: now }],
    paperFiles: [{ paperId: 'paper', blob: new Blob(['%PDF-old'], { type: 'application/pdf' }), cachedAt: now }],
    paperReadingStates: [], paperAnnotations: [], nodePaperRelations: [{ id: 'relation', documentId: 'original', nodeId: root.id, paperId: 'paper', createdAt: now }],
    annotationNodeRelations: [], meta: [{ key: 'preserved', value: 'yes' }],
  }
}
describe('binary backup archive', () => {
  beforeEach(async () => {
    await appDatabase.open()
    await appDatabase.transaction('rw', appDatabase.tables, () => Promise.all(appDatabase.tables.map(t => t.clear())))
  })
  it('restores metadata, history, relations and both binary types through the public backup service', async () => {
    const rows = fixture(), backup = await createBinaryBackup(rows, 'researchmind-local-backup')
    await restoreLocalBackup(backup.blob)
    expect(await appDatabase.documents.toArray()).toEqual(rows.documents)
    expect(await appDatabase.versions.toArray()).toEqual(rows.versions)
    expect(await appDatabase.nodePaperRelations.toArray()).toEqual(rows.nodePaperRelations)
    expect(await (await appDatabase.paperFiles.get('paper'))!.blob.text()).toBe('%PDF-old')
    expect(await (await appDatabase.attachmentBlobs.get('attachment'))!.blob.text()).toBe('附件')
    expect(await appDatabase.meta.get('preserved')).toEqual(rows.meta[0])
  })
  it('rejects a changed binary before replacing any current data', async () => {
    const rows = fixture(), backup = await createBinaryBackup(rows, 'researchmind-local-backup')
    await appDatabase.documents.bulkPut(rows.documents)
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer())
    zip.file('binaries/paperFiles-0.bin', '%PDF-bad')
    const corrupt = new Blob([new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))])
    await expect(restoreLocalBackup(corrupt)).rejects.toThrow('完整性校验失败')
    expect(await appDatabase.documents.toArray()).toEqual(rows.documents)
    expect(await appDatabase.meta.get('last-restored-at')).toBeUndefined()
  })
  it('rejects changed metadata and missing binaries, and distinguishes partial backups', async () => {
    const backup = await createBinaryBackup(fixture(), 'researchmind-local-backup')
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    manifest.tables.documents[0].title = '被修改'
    zip.file('manifest.json', JSON.stringify(manifest))
    await expect(readBackupRows(new Blob([new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))]))).rejects.toThrow('完整性校验失败')
    const missing = await JSZip.loadAsync(await backup.blob.arrayBuffer())
    missing.remove('binaries/paperFiles-0.bin')
    await expect(readBackupRows(new Blob([new Uint8Array(await missing.generateAsync({ type: 'uint8array' }))]))).rejects.toThrow('备份缺少论文或附件')
    const partial = await createBinaryBackup(fixture(), 'researchmind-partial-backup')
    await expect(readBackupRows(partial.blob)).rejects.toThrow('格式或版本不受支持')
    expect((await readBackupRows(partial.blob, ['researchmind-partial-backup'])).rows.documents).toHaveLength(1)
  })
})
