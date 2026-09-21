import type { MindMapDocument, NodeData } from '../types/mindmap'
import { createNode } from '../utils/tree'

function branch(title: string, children: NodeData[] = []): NodeData {
  return { ...createNode(title), children }
}

const createdAt = '2026-09-18T08:00:00.000Z'

export const mockDocuments: MindMapDocument[] = [
  {
    id: 'research-map', title: '自动驾驶感知研究', folderId: 'research',
    isFavorite: true, version: 12, createdAt, updatedAt: '2026-09-20T09:38:00.000Z',
    root: branch('研究方向', [
      branch('鱼眼视觉', [branch('相机模型'), branch('柱状投影'), branch('BEV')]),
      branch('激光雷达', [branch('点云表征'), branch('船舶检测')]),
      branch('深度学习', [branch('Transformer'), branch('多模态融合')]),
    ]),
  },
  {
    id: 'paper-reading', title: '论文阅读清单', folderId: 'research',
    isFavorite: false, version: 4, createdAt, updatedAt: '2026-09-19T12:20:00.000Z',
    root: branch('论文阅读', [branch('待读', [branch('视觉基础模型')]), branch('已整理')]),
  },
  {
    id: 'novel-world', title: '长篇小说世界观', folderId: 'writing',
    isFavorite: false, version: 8, createdAt, updatedAt: '2026-09-16T14:10:00.000Z',
    root: branch('雾港纪事', [branch('人物关系'), branch('地理与势力'), branch('时间线')]),
  },
]
