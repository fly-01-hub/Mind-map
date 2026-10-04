import { parseWikiLinks } from '../../utils/wikiLinks'

export function WikiText({ text, onOpen }: { text: string; onOpen: (name: string) => void }) {
  const links = parseWikiLinks(text)
  return <>{links.map((link, index) => {
    const prefix = text.slice(index ? links[index - 1].contentEnd : 0, link.contentStart)
    return <span key={link.start}>{prefix}<span className="wiki-link" role="link" tabIndex={0} title={`双击打开或新建文档「${link.name}」`}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.stopPropagation(); onOpen(link.name) }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onOpen(link.name) } }}
    >{text.slice(link.contentStart, link.contentEnd)}</span></span>
  })}{text.slice(links.at(-1)?.contentEnd ?? 0)}</>
}
