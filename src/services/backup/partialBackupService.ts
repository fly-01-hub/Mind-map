import { appDatabase } from '../../db/appDatabase'
import type { MindMapDocument, NodeData } from '../../types/mindmap'
import { documentNameKey, rewriteTreeLinks, uniqueDocumentName } from '../../utils/wikiLinks'
import { backupFromRows, readBackupRows, type LocalRows } from './localBackupService'

export type PreparedMapImport = Awaited<ReturnType<typeof prepareMapImport>>
const uid = () => crypto.randomUUID()

function selectRows(rows: LocalRows, ids: string[]): LocalRows {
  const wanted = new Set(ids)
  if (!wanted.size) throw new Error('请至少选择一份思维导图。')
  const documents = rows.documents.filter(d => wanted.has(d.id) && !d.deletedAt)
  if (documents.length !== wanted.size) throw new Error('所选导图不存在或已在回收站中，请重新选择。')
  const versions = rows.versions.filter(v => wanted.has(v.documentId))
  const nodes = new Map<string, Set<string>>()
  for (const d of documents) nodes.set(d.id, new Set())
  const visit = (n: NodeData, set: Set<string>) => { set.add(n.id); n.children.forEach(c => visit(c, set)) }
  for (const d of documents) visit(d.root, nodes.get(d.id)!)
  for (const v of versions) visit(v.root, nodes.get(v.documentId)!)
  const inScope = (r: { documentId: string; nodeId: string }) => nodes.get(r.documentId)?.has(r.nodeId)
  const nodePaperRelations = rows.nodePaperRelations.filter(inScope)
  const annotationNodeRelations = rows.annotationNodeRelations.filter(inScope)
  const annotationIds = new Set(annotationNodeRelations.map(r => r.annotationId))
  const paperIds = new Set(nodePaperRelations.map(r => r.paperId))
  rows.paperAnnotations.filter(a => annotationIds.has(a.id)).forEach(a => paperIds.add(a.paperId))
  const papers = rows.papers.filter(p => paperIds.has(p.id))
  if (papers.length !== paperIds.size) throw new Error('导图关联的论文记录不完整，已停止导入或备份。')
  const folderIds = new Set<string>()
  const byFolder = new Map(rows.folders.map(f => [f.id, f]))
  for (const d of documents) {
    let id = d.folderId
    const seen = new Set<string>()
    while (id && byFolder.has(id)) {
      if (seen.has(id)) throw new Error('文件夹层级循环，无法处理此备份。')
      seen.add(id); folderIds.add(id); id = byFolder.get(id)!.parentId
    }
  }
  return { documents, folders: rows.folders.filter(f => folderIds.has(f.id)), versions,
    attachmentBlobs: rows.attachmentBlobs.filter(a => wanted.has(a.documentId)), papers,
    paperFiles: rows.paperFiles.filter(p => paperIds.has(p.paperId)), paperReadingStates: rows.paperReadingStates.filter(p => paperIds.has(p.paperId)),
    paperAnnotations: rows.paperAnnotations.filter(a => paperIds.has(a.paperId)), nodePaperRelations,
    annotationNodeRelations, meta: [] }
}

export async function createPartialBackup(ids: string[], current: Pick<LocalRows, 'documents' | 'folders'>) {
  const rows = await appDatabase.transaction('r', appDatabase.tables, async () => {
    const wanted = [...new Set(ids)]
    if (!wanted.length) throw new Error('请至少选择一份思维导图。')
    const [versions, attachmentBlobs, nodePaperRelations, annotationNodeRelations] = await Promise.all([
      appDatabase.versions.where('documentId').anyOf(wanted).toArray(), appDatabase.attachmentBlobs.where('documentId').anyOf(wanted).toArray(),
      appDatabase.nodePaperRelations.where('documentId').anyOf(wanted).toArray(), appDatabase.annotationNodeRelations.where('documentId').anyOf(wanted).toArray(),
    ])
    const linkedAnnotations = await appDatabase.paperAnnotations.bulkGet(annotationNodeRelations.map(r => r.annotationId))
    const paperIds = [...new Set([...nodePaperRelations.map(r => r.paperId), ...linkedAnnotations.flatMap(a => a ? [a.paperId] : [])])]
    const [papers, paperFiles, paperReadingStates, paperAnnotations] = await Promise.all([
      appDatabase.papers.bulkGet(paperIds), appDatabase.paperFiles.bulkGet(paperIds), appDatabase.paperReadingStates.bulkGet(paperIds),
      appDatabase.paperAnnotations.where('paperId').anyOf(paperIds).toArray(),
    ])
    return selectRows({ documents: structuredClone(current.documents), folders: structuredClone(current.folders), versions, attachmentBlobs,
      papers: papers.filter(p => p !== undefined), paperFiles: paperFiles.filter(p => p !== undefined),
      paperReadingStates: paperReadingStates.filter(p => p !== undefined), paperAnnotations, nodePaperRelations, annotationNodeRelations, meta: [] }, wanted)
  })
  // A backup should never silently omit a locally unavailable binary.
  for (const p of rows.papers) if (!p.deletedAt && !rows.paperFiles.some(f => f.paperId === p.id)) throw new Error(`论文“${p.title}”的 PDF 不在本机，请先恢复 PDF 后再备份所选导图。`)
  const blobs = new Set(rows.attachmentBlobs.map(b => b.id))
  const checkAttachments = (n: NodeData) => {
    for (const a of n.attachments) if (!a.deletedAt && a.storagePath.startsWith('local://') && !blobs.has(a.id)) throw new Error(`附件“${a.fileName}”不在本机，部分备份已停止。`)
    n.children.forEach(checkAttachments)
  }
  rows.documents.forEach(d => checkAttachments(d.root))
  return backupFromRows(rows, 'researchmind-partial-backup')
}

export async function prepareMapImport(file: Blob) {
  const prepared = await readBackupRows(file, ['researchmind-partial-backup', 'researchmind-local-backup'])
  if (!prepared.rows.documents.some(d => !d.deletedAt)) throw new Error('文件中没有可导入的思维导图。')
  return prepared
}

// Add copies under new identities. No incoming table can replace existing rows.
export async function importSelectedMaps(prepared: PreparedMapImport, ids: string[]) {
  const selected = selectRows(prepared.rows, ids)
  return appDatabase.transaction('rw', appDatabase.tables, async () => {
    const marker = (kind: string, id: string) => `partial-import:${prepared.sourceId}:${kind}:${id}`
    const imported = new Map<string, string>()
    let skipped = 0
    for (const d of selected.documents) {
      const previous = await appDatabase.meta.get(marker('document', d.id))
      if (previous && await appDatabase.documents.get(previous.value)) { imported.set(d.id, previous.value); skipped++ }
    }
    const fresh = selected.documents.filter(d => !imported.has(d.id))
    if (!fresh.length) return { documentCount: 0, skipped, paperCount: 0 }
    const rows = selectRows(selected, fresh.map(d => d.id))
    const now = new Date().toISOString()
    const existing = await appDatabase.documents.toArray()
    const names = new Map<string, string>()
    for (const d of selected.documents) {
      if (imported.has(d.id)) names.set(d.id, (await appDatabase.documents.get(imported.get(d.id)!))!.title)
      else {
        const title = uniqueDocumentName(existing, d.title)
        imported.set(d.id, uid()); names.set(d.id, title)
        existing.push({ ...d, id: imported.get(d.id)!, title, linkAliases: [] })
      }
    }
    const renamed = new Map<string, { from: string; to: string }>()
    for (const d of selected.documents) for (const from of [d.title, ...(d.linkAliases ?? [])]) {
      const owners = selected.documents.filter(s => [s.title, ...(s.linkAliases ?? [])].some(n => documentNameKey(n) === documentNameKey(from)))
      if (owners.length === 1) renamed.set(documentNameKey(from), { from, to: names.get(d.id)! })
    }
    // Two phases prevent A -> A (2) -> A (3) cascading when source names overlap.
    const rewrites = [...renamed.values()].filter(r => r.from !== r.to).map(r => ({ ...r, temporary: `import-link-${uid()}` }))
    const rewrite = (root: NodeData) => {
      let result = root
      for (const r of rewrites) result = rewriteTreeLinks(result, r.from, r.temporary)
      for (const r of rewrites) result = rewriteTreeLinks(result, r.temporary, r.to)
      return result
    }
    const folders = new Map(rows.folders.map(f => [f.id, uid()]))
    for (const f of rows.folders) await appDatabase.folders.add({ ...f, id: folders.get(f.id)!, parentId: f.parentId ? folders.get(f.parentId) : undefined, deletedAt: undefined })
    const nodeIds = new Map<string, string>()
    const nodeId = (doc: string, old: string) => {
      const key = `${doc}\0${old}`
      if (!nodeIds.has(key)) nodeIds.set(key, uid())
      return nodeIds.get(key)!
    }
    const attachmentIds = new Map<string, string>()
    const attachmentId = (id: string) => { if (!attachmentIds.has(id)) attachmentIds.set(id, uid()); return attachmentIds.get(id)! }
    const tree = (root: NodeData, doc: string): NodeData => ({ ...root, id: nodeId(doc, root.id),
      attachments: (root.attachments ?? []).map(a => ({ ...a, id: attachmentId(a.id), storagePath: a.storagePath.startsWith('local://') ? `local://${attachmentId(a.id)}` : a.storagePath })),
      children: root.children.map(c => tree(c, doc)) })
    const visuals = (d: Pick<MindMapDocument, 'arrows' | 'summaries'>, doc: string) => ({
      arrows: d.arrows?.map(a => ({ ...a, id: uid(), from: nodeId(doc, a.from), to: nodeId(doc, a.to) })),
      summaries: d.summaries?.map(s => ({ ...s, id: uid(), parent: nodeId(doc, s.parent), nodeIds: s.nodeIds?.map(id => nodeId(doc, id)) })),
    })
    for (const d of rows.documents) {
      const root = tree(rewrite(d.root), d.id)
      if (root.title === d.title) { root.title = names.get(d.id)!; root.richText = undefined }
      await appDatabase.documents.add({ ...d, id: imported.get(d.id)!, title: names.get(d.id)!, root, ...visuals(d, d.id),
        folderId: d.folderId ? folders.get(d.folderId) : undefined, linkAliases: [], deletedAt: undefined, updatedAt: now })
      await appDatabase.meta.put({ key: marker('document', d.id), value: imported.get(d.id)! })
    }
    for (const v of rows.versions) await appDatabase.versions.add({ ...v, id: uid(), documentId: imported.get(v.documentId)!, root: tree(rewrite(v.root), v.documentId), ...visuals(v, v.documentId) })
    for (const a of rows.attachmentBlobs) await appDatabase.attachmentBlobs.add({ ...a, id: attachmentId(a.id), documentId: imported.get(a.documentId)!, nodeId: nodeId(a.documentId, a.nodeId) })
    const paperIds = new Map<string, string>()
    for (const p of rows.papers) {
      const same = await appDatabase.papers.where('checksum').equals(p.checksum).filter(paper => !paper.deletedAt).first()
      const id = same?.id ?? uid(); paperIds.set(p.id, id)
      if (!same) await appDatabase.papers.add({ ...p, id, userId: `partial:${uid()}`, filePath: `local://${id}` })
      const file = rows.paperFiles.find(f => f.paperId === p.id)
      if (file && !await appDatabase.paperFiles.get(id)) await appDatabase.paperFiles.add({ ...file, paperId: id })
      const reading = rows.paperReadingStates.find(r => r.paperId === p.id)
      if (reading && !await appDatabase.paperReadingStates.get(id)) await appDatabase.paperReadingStates.add({ ...reading, paperId: id })
    }
    const annotations = new Map<string, string>()
    for (const a of rows.paperAnnotations) {
      const key = marker('annotation', a.id)
      const previous = await appDatabase.meta.get(key)
      if (previous && await appDatabase.paperAnnotations.get(previous.value)) annotations.set(a.id, previous.value)
      else {
        const id = uid(); annotations.set(a.id, id)
        await appDatabase.paperAnnotations.add({ ...a, id, paperId: paperIds.get(a.paperId)! })
        await appDatabase.meta.put({ key, value: id })
      }
    }
    const relationKeys = new Set<string>()
    for (const r of rows.nodePaperRelations) {
      const paperId = paperIds.get(r.paperId)!, mappedNode = nodeId(r.documentId, r.nodeId)
      const key = `${r.documentId}\0${mappedNode}\0${paperId}`
      if (relationKeys.has(key)) continue
      relationKeys.add(key)
      await appDatabase.nodePaperRelations.add({ ...r, id: uid(), documentId: imported.get(r.documentId)!, nodeId: mappedNode, paperId })
    }
    for (const r of rows.annotationNodeRelations) {
      const annotationId = annotations.get(r.annotationId)
      if (!annotationId) throw new Error('批注关联记录不完整，导入已回滚。')
      await appDatabase.annotationNodeRelations.add({ ...r, id: uid(), documentId: imported.get(r.documentId)!, nodeId: nodeId(r.documentId, r.nodeId), annotationId })
    }
    return { documentCount: fresh.length, skipped, paperCount: paperIds.size }
  })
}
