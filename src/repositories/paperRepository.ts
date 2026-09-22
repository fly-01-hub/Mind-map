import { appDatabase } from '../db/appDatabase'
import type { LinkedPaper, NodePaperRelation, Paper } from '../types/paper'

export function isPdfFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function titleFromPdfFileName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || '未命名论文'
}

async function checksum(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function createOrReusePaper(file: File, userId: string, fileChecksum: string): Promise<Paper> {
  // Older local databases may still contain the ID of a former cloud account.
  // Ownership no longer limits access, so reuse identical local files regardless of that legacy value.
  const existing = await appDatabase.papers.where('checksum').equals(fileChecksum).first()
  const now = new Date().toISOString()
  if (existing) {
    const restored = existing.deletedAt ? { ...existing, deletedAt: undefined, updatedAt: now } : existing
    await appDatabase.papers.put(restored)
    if (!await appDatabase.paperFiles.get(existing.id)) {
      await appDatabase.paperFiles.put({ paperId: existing.id, blob: file, cachedAt: now })
    }
    return restored
  }

  const id = crypto.randomUUID()
  const paper: Paper = {
    id,
    userId,
    title: titleFromPdfFileName(file.name),
    fileName: file.name,
    filePath: `local://${id}`,
    fileSize: file.size,
    pageCount: 0,
    checksum: fileChecksum,
    createdAt: now,
    updatedAt: now,
  }
  await appDatabase.papers.add(paper)
  await appDatabase.paperFiles.put({ paperId: id, blob: file, cachedAt: now })
  return paper
}

async function link(documentId: string, nodeId: string, paperId: string): Promise<NodePaperRelation> {
  const existing = await appDatabase.nodePaperRelations
    .where('[documentId+nodeId+paperId]').equals([documentId, nodeId, paperId]).first()
  if (existing) {
    if (existing.deletedAt) {
      const restored = { ...existing, deletedAt: undefined }
      await appDatabase.nodePaperRelations.put(restored)
      return restored
    }
    return existing
  }
  const relation: NodePaperRelation = {
    id: crypto.randomUUID(), documentId, nodeId, paperId, createdAt: new Date().toISOString(),
  }
  await appDatabase.nodePaperRelations.add(relation)
  return relation
}

export const paperRepository = {
  listPapers: () => appDatabase.papers.filter((paper) => !paper.deletedAt).toArray(),
  listRelations: () => appDatabase.nodePaperRelations.filter((relation) => !relation.deletedAt).toArray(),
  listAnnotations: () => appDatabase.paperAnnotations.filter((annotation) => !annotation.deletedAt).toArray(),

  async saveAndLink(file: File, documentId: string, nodeId: string, userId: string) {
    if (!isPdfFile(file)) throw new Error('只能上传 PDF 文件。')
    const fileChecksum = await checksum(file)
    return appDatabase.transaction(
      'rw',
      [appDatabase.papers, appDatabase.paperFiles, appDatabase.nodePaperRelations],
      async () => {
        const paper = await createOrReusePaper(file, userId, fileChecksum)
        const relation = await link(documentId, nodeId, paper.id)
        return { paper, relation }
      },
    )
  },

  link,

  async unlink(documentId: string, nodeId: string, paperId: string) {
    const relation = await appDatabase.nodePaperRelations
      .where('[documentId+nodeId+paperId]').equals([documentId, nodeId, paperId]).first()
    if (relation) await appDatabase.nodePaperRelations.put({ ...relation, deletedAt: new Date().toISOString() })
  },

  async linkedToNode(documentId: string, nodeId: string): Promise<LinkedPaper[]> {
    const relations = await appDatabase.nodePaperRelations.where('nodeId').equals(nodeId)
      .filter((relation) => relation.documentId === documentId && !relation.deletedAt).toArray()
    if (!relations.length) return []
    const papers = await appDatabase.papers.bulkGet(relations.map((relation) => relation.paperId))
    const annotations = await appDatabase.paperAnnotations
      .where('paperId').anyOf(relations.map((relation) => relation.paperId)).toArray()
    return relations.flatMap((relation, index) => {
      const paper = papers[index]
      if (!paper || paper.deletedAt) return []
      return [{
        ...paper,
        relationId: relation.id,
        annotationCount: annotations.filter((annotation) => annotation.paperId === paper.id && !annotation.deletedAt).length,
      }]
    })
  },

  getFile: async (paperId: string) => (await appDatabase.paperFiles.get(paperId))?.blob,

  cacheFile: (paperId: string, blob: Blob) => appDatabase.paperFiles.put({
    paperId, blob, cachedAt: new Date().toISOString(),
  }),

  getReadingState: (paperId: string) => appDatabase.paperReadingStates.get(paperId),

  saveReadingState: (paperId: string, pageNumber: number, scale: number, scrollOffset = 0) =>
    appDatabase.paperReadingStates.put({
      paperId, pageNumber, scale, scrollOffset, updatedAt: new Date().toISOString(),
    }),

  async updatePageCount(paperId: string, pageCount: number) {
    const paper = await appDatabase.papers.get(paperId)
    if (!paper || paper.pageCount === pageCount) return paper
    const updated = { ...paper, pageCount, updatedAt: new Date().toISOString() }
    await appDatabase.papers.put(updated)
    return updated
  },
}
