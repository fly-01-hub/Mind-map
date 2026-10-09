// Synthetic test records. Never imported by the application or included in packages.
import type { MindMapDocument, NodeData, FolderData } from '../../src/types/mindmap'
import { createNode } from '../../src/utils/tree'

function branch(title: string, children: NodeData[] = []): NodeData {
  return { ...createNode(title), children }
}
const createdAt = '2026-01-01T00:00:00.000Z'
export const testDocuments: MindMapDocument[] = [
  { id: 'test-map', title: '测试导图甲', folderId: 'test-folder-a', isFavorite: true,
    version: 1, createdAt, updatedAt: createdAt,
    root: branch('测试主题', [
      branch('分支甲项', [branch('子项甲一'), branch('子项甲二'), branch('子项甲三')]),
      branch('分支乙项', [branch('子项乙一'), branch('子项乙二')]),
      branch('分支丙项', [branch('子项丙一'), branch('子项丙二')]),
    ]),
  },
  { id: 'test-map-b', title: '测试导图乙', folderId: 'test-folder-a', isFavorite: false,
    version: 1, createdAt, updatedAt: createdAt,
    root: branch('测试主题乙', [branch('分支乙', [branch('测试子项')]), branch('分支丁')]),
  },
  { id: 'test-map-c', title: '测试导图丙', folderId: 'test-folder-b', isFavorite: false,
    version: 1, createdAt, updatedAt: createdAt,
    root: branch('测试主题丙', [branch('子项一'), branch('子项二'), branch('子项三')]),
  },
]
export const testFolders: FolderData[] = [
  { id: 'test-folder-a', name: '测试文件夹甲', order: 0, createdAt, updatedAt: createdAt },
  { id: 'test-folder-b', name: '测试文件夹乙', order: 1, createdAt, updatedAt: createdAt },
]
