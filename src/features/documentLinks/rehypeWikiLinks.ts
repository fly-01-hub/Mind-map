import { parseWikiLinks } from '../../utils/wikiLinks'

interface HtmlNode { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HtmlNode[] }
export function rehypeWikiLinks() {
  return (tree: HtmlNode) => {
    const visit = (node: HtmlNode) => {
      if (!node.children || ['code', 'pre', 'a'].includes(node.tagName ?? '')) return
      node.children = node.children.flatMap((child): HtmlNode[] => {
        if (child.type !== 'text' || !child.value) { visit(child); return [child] }
        const text = child.value
        const result: HtmlNode[] = []
        let offset = 0
        for (const link of parseWikiLinks(text)) {
          result.push({ type: 'text', value: text.slice(offset, link.contentStart) }, {
            type: 'element', tagName: 'span', properties: { className: ['wiki-link'], dataWikiName: link.name, role: 'link', tabIndex: 0, title: `双击打开或新建文档「${link.name}」` },
            children: [{ type: 'text', value: text.slice(link.contentStart, link.contentEnd) }],
          })
          offset = link.contentEnd
        }
        result.push({ type: 'text', value: text.slice(offset) })
        return result
      })
    }
    visit(tree)
  }
}
