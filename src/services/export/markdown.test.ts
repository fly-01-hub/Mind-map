import { describe, expect, it } from 'vitest'
import { createNode } from '../../utils/tree'
import { markdownToTree, treeToMarkdown } from './markdown'

describe('Markdown import and export', () => {
  it('parses an indented Markdown outline', () => {
    const root = markdownToTree('# 研究方向\n\n- 鱼眼视觉\n  - BEV\n- LiDAR\n')
    expect(root.title).toBe('研究方向')
    expect(root.children.map((node) => node.title)).toEqual(['鱼眼视觉', 'LiDAR'])
    expect(root.children[0].children[0].title).toBe('BEV')
  })

  it('round-trips links, tags, notes and task state', () => {
    const root = createNode('研究')
    root.tags = ['论文']
    root.note = '重点阅读方法部分'
    root.hyperlink = 'https://example.com/paper'
    root.taskStatus = 'doing'
    root.children = [createNode('实验')]
    const restored = markdownToTree(treeToMarkdown(root))
    expect(restored.title).toBe(root.title)
    expect(restored.tags).toEqual(root.tags)
    expect(restored.note).toBe(root.note)
    expect(restored.hyperlink).toBe(root.hyperlink)
    expect(restored.taskStatus).toBe(root.taskStatus)
    expect(restored.children[0].title).toBe('实验')
  })
})
