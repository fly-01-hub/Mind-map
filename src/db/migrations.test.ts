import { describe, expect, it } from 'vitest'
import { migrateDocument, migrateNodeData } from './migrations'

describe('data migrations', () => {
  it('upgrades legacy text-only nodes and recursively fills rich defaults', () => {
    const node = migrateNodeData({ id: 'root', text: '旧根节点', children: [{ id: 'child', title: '子节点' }] })
    expect(node.title).toBe('旧根节点')
    expect(node.taskStatus).toBe('none')
    expect(node.attachments).toEqual([])
    expect(node.children[0]).toMatchObject({ id: 'child', order: 0, tags: [], note: '' })
  })

  it('keeps valid document metadata and repairs invalid optional data', () => {
    const document = migrateDocument({
      id: 'legacy-document', title: '旧文档', version: 0, isFavorite: true,
      root: { id: 'root', title: '主题', taskStatus: 'invalid', attachments: [{ id: 'a', fileName: 'paper.pdf' }] },
    })
    expect(document).toBeDefined()
    expect(document?.version).toBe(1)
    expect(document?.root.taskStatus).toBe('none')
    expect(document?.root.attachments[0]).toMatchObject({ mimeType: 'application/octet-stream', size: 0 })
  })
})
