import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Archive, BookOpen, Clock3, FileText, Folder, FolderPlus, GitBranch, HardDrive, Heart,
  LayoutGrid, List, MoreHorizontal, Plus, RotateCcw, Search, ShieldCheck,
  Star, Tag, Trash2, X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentRepository } from '../../repositories/documentRepository'
import { useDocumentStore } from '../../stores/documentStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useUserStore } from '../../stores/userStore'
import type { FolderData, MindMapDocument, NodeData } from '../../types/mindmap'
import { countNodes } from '../../utils/tree'
import { BackupDialog } from '../backup/BackupDialog'

function nodeMatches(node: NodeData, term: string): string | undefined {
  if ([node.title, node.note, ...node.tags].some((value) => value.toLowerCase().includes(term))) return node.id
  for (const child of node.children) {
    const match = nodeMatches(child, term)
    if (match) return match
  }
}

function collectTags(node: NodeData, result = new Set<string>()) {
  node.tags.forEach((tag) => result.add(tag))
  node.children.forEach((child) => collectTags(child, result))
  return result
}

function hasTag(node: NodeData, tag: string): boolean {
  return node.tags.includes(tag) || node.children.some((child) => hasTag(child, tag))
}

function FolderTreeRow({ folder, folders, documents, filter, depth, setFilter }: {
  folder: FolderData
  folders: FolderData[]
  documents: MindMapDocument[]
  filter: string
  depth: number
  setFilter: (value: string) => void
}) {
  const createFolder = useDocumentStore((state) => state.createFolder)
  const renameFolder = useDocumentStore((state) => state.renameFolder)
  const deleteFolder = useDocumentStore((state) => state.deleteFolder)
  const moveDocument = useDocumentStore((state) => state.moveDocument)
  const children = folders.filter((item) => !item.deletedAt && item.parentId === folder.id).sort((a, b) => a.order - b.order)
  const count = documents.filter((document) => document.folderId === folder.id && !document.deletedAt).length

  const addChild = () => {
    const name = window.prompt('子文件夹名称')?.trim()
    if (name) createFolder(name, folder.id)
  }
  const rename = () => {
    const name = window.prompt('重命名文件夹', folder.name)?.trim()
    if (name) renameFolder(folder.id, name)
  }
  const remove = () => {
    if (window.confirm(`删除“${folder.name}”？其中的文档会进入回收站。`)) {
      deleteFolder(folder.id)
      if (filter === `folder:${folder.id}`) setFilter('all')
    }
  }

  return <>
    <div className={`folder-tree-row ${filter === `folder:${folder.id}` ? 'active' : ''}`} style={{ paddingLeft: `${8 + depth * 14}px` }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData('application/x-zhijian-document'); if (id) moveDocument(id, folder.id) }}>
      <button className="folder-select" onClick={() => setFilter(`folder:${folder.id}`)}><Folder size={16} />{folder.name}<span>{count || ''}</span></button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button className="folder-more" aria-label={`${folder.name}更多操作`}><MoreHorizontal size={14} /></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="start">
          <DropdownMenu.Item className="dropdown-item" onSelect={addChild}><FolderPlus size={15} />新建子文件夹</DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item" onSelect={rename}><FileText size={15} />重命名</DropdownMenu.Item>
          <DropdownMenu.Separator className="context-separator" />
          <DropdownMenu.Item className="dropdown-item danger-item" onSelect={remove}><Trash2 size={15} />删除并移入回收站</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
    {children.map((child) => <FolderTreeRow key={child.id} folder={child} folders={folders} documents={documents} filter={filter} depth={depth + 1} setFilter={setFilter} />)}
  </>
}

function DocumentRow({ document, folders, inTrash, open, viewMode = 'list' }: {
  document: MindMapDocument
  folders: FolderData[]
  inTrash: boolean
  open: (document: MindMapDocument) => void
  viewMode?: 'list' | 'grid'
}) {
  const toggleFavorite = useDocumentStore((state) => state.toggleFavorite)
  const trashDocument = useDocumentStore((state) => state.trashDocument)
  const restoreDocument = useDocumentStore((state) => state.restoreDocument)
  const removeDocumentFromState = useDocumentStore((state) => state.removeDocumentFromState)
  const moveDocument = useDocumentStore((state) => state.moveDocument)
  const folderName = folders.find((folder) => folder.id === document.folderId)?.name ?? '未分类'

  const permanentlyDelete = async () => {
    if (!window.confirm(`永久删除“${document.title}”？此操作无法撤销。`)) return
    try {
      await documentRepository.permanentlyDeleteDocument(document.id)
      removeDocumentFromState(document.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '永久删除失败，请稍后重试。')
    }
  }
  const moveToTrash = async () => {
    await documentRepository.createVersion(document, 'important')
    trashDocument(document.id)
  }

  const menu = () => <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><button className="icon-button row-action" aria-label="更多" onClick={(event) => event.stopPropagation()}><MoreHorizontal size={18} /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end">
      {inTrash ? <>
        <DropdownMenu.Item className="dropdown-item" onSelect={() => restoreDocument(document.id)}><RotateCcw size={15} />恢复</DropdownMenu.Item>
        <DropdownMenu.Item className="dropdown-item danger-item" onSelect={() => void permanentlyDelete()}><Trash2 size={15} />永久删除</DropdownMenu.Item>
      </> : <>
        <DropdownMenu.Label className="dropdown-label">移动到文件夹</DropdownMenu.Label>
        {folders.filter((folder) => !folder.deletedAt).map((folder) => <DropdownMenu.Item key={folder.id} className="dropdown-item" onSelect={() => moveDocument(document.id, folder.id)}><Folder size={15} />{folder.name}</DropdownMenu.Item>)}
        <DropdownMenu.Separator className="context-separator" />
        <DropdownMenu.Item className="dropdown-item danger-item" onSelect={() => void moveToTrash()}><Trash2 size={15} />移到回收站</DropdownMenu.Item>
      </>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>

  if (viewMode === 'grid') return (
    <article className="document-card" role="button" tabIndex={0} draggable={!inTrash} onDragStart={(event) => event.dataTransfer.setData('application/x-zhijian-document', document.id)} onClick={() => !inTrash && open(document)} onKeyDown={(event) => event.key === 'Enter' && !inTrash && open(document)}>
      <header><span className="document-card-icon"><FileText size={19} /></span><div className="document-card-actions">{!inTrash && <button className={`icon-button ${document.isFavorite ? 'is-favorite' : ''}`} aria-label="收藏" onClick={(event) => { event.stopPropagation(); toggleFavorite(document.id) }}><Star size={16} fill={document.isFavorite ? 'currentColor' : 'none'} /></button>}{menu()}</div></header>
      <div className="document-card-body"><strong>{document.title}</strong><span><GitBranch size={13} />{countNodes(document.root)} 个节点</span></div>
      <footer><span className="folder-pill">{folderName}</span><time>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(document.updatedAt))}</time></footer>
    </article>
  )

  return (
    <div className="document-row" role="button" tabIndex={0} draggable={!inTrash} onDragStart={(event) => event.dataTransfer.setData('application/x-zhijian-document', document.id)} onClick={() => !inTrash && open(document)} onKeyDown={(event) => event.key === 'Enter' && !inTrash && open(document)}>
      <div className="document-icon"><FileText size={18} /></div>
      <div className="document-name"><strong>{document.title}</strong><span>{countNodes(document.root)} 个节点</span></div>
      <span className="folder-pill">{folderName}</span>
      <time>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(document.updatedAt))}</time>
      {!inTrash && <button className={`icon-button row-action ${document.isFavorite ? 'is-favorite' : ''}`} aria-label="收藏" onClick={(event) => { event.stopPropagation(); toggleFavorite(document.id) }}><Star size={17} fill={document.isFavorite ? 'currentColor' : 'none'} /></button>}
      {menu()}
    </div>
  )
}

export function LibraryPage() {
  const navigate = useNavigate()
  const documents = useDocumentStore((state) => state.documents)
  const folders = useDocumentStore((state) => state.folders)
  const createDocument = useDocumentStore((state) => state.createDocument)
  const createFolder = useDocumentStore((state) => state.createFolder)
  const openDocument = useDocumentStore((state) => state.openDocument)
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode)
  const user = useUserStore()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => window.localStorage.getItem('zhijian-library-view') === 'grid' ? 'grid' : 'list')
  const changeViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode)
    window.localStorage.setItem('zhijian-library-view', mode)
  }

  const visibleDocuments = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = documents.filter((document) => {
      if (filter === 'trash') return Boolean(document.deletedAt)
      if (document.deletedAt) return false
      if (filter === 'favorites' && !document.isFavorite) return false
      if (filter.startsWith('folder:') && document.folderId !== filter.slice(7)) return false
      if (filter.startsWith('tag:') && !hasTag(document.root, filter.slice(4))) return false
      return !term || document.title.toLowerCase().includes(term) || Boolean(nodeMatches(document.root, term))
    })
    return filter === 'recent' ? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : list
  }, [documents, filter, query])

  const open = (document: MindMapDocument) => {
    const match = query.trim() ? nodeMatches(document.root, query.trim().toLowerCase()) : undefined
    openDocument(document.id)
    setSelectedNode(match)
    navigate(`/map/${document.id}`)
  }
  const create = () => {
    const document = createDocument()
    setSelectedNode(document.root.id)
    navigate(`/map/${document.id}`)
  }
  const submitFolder = () => {
    if (folderDraft.trim()) { const id = createFolder(folderDraft.trim()); setFilter(`folder:${id}`) }
    setFolderDraft(''); setAddingFolder(false)
  }
  const activeFolder = filter.startsWith('folder:') ? folders.find((folder) => folder.id === filter.slice(7)) : undefined
  const activeTag = filter.startsWith('tag:') ? filter.slice(4) : undefined
  const tags = [...new Set(documents.filter((document) => !document.deletedAt).flatMap((document) => [...collectTags(document.root)]))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const heading = filter === 'favorites' ? '收藏' : filter === 'recent' ? '最近打开' : filter === 'trash' ? '回收站' : activeTag ? `# ${activeTag}` : activeFolder?.name ?? '全部文档'
  const activeDocuments = documents.filter((item) => !item.deletedAt)
  const totalNodeCount = activeDocuments.reduce((total, item) => total + countNodes(item.root), 0)
  const activeFolderCount = folders.filter((item) => !item.deletedAt).length
  const subtitle = filter === 'trash' ? '这里的内容仍可恢复，永久删除后无法撤销' : activeFolder ? `浏览“${activeFolder.name}”中的知识地图` : activeTag ? '按标签聚合相关导图' : '整理思路、论文与长期研究资料'
  return (
    <div className="library-shell">
      <aside className="library-sidebar">
        <div className="library-brand"><span className="brand-symbol">枝</span><strong>枝间</strong></div>
        <nav className="sidebar-nav" aria-label="知识库导航">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><Archive size={17} />全部文档<span>{documents.filter((item) => !item.deletedAt).length}</span></button>
          <button className={filter === 'recent' ? 'active' : ''} onClick={() => setFilter('recent')}><Clock3 size={17} />最近打开</button>
          <button className={filter === 'favorites' ? 'active' : ''} onClick={() => setFilter('favorites')}><Heart size={17} />收藏</button>
        </nav>
        <div className="sidebar-section-title"><span>文件夹</span><button className="tiny-button" aria-label="新建文件夹" onClick={() => setAddingFolder(true)}><FolderPlus size={15} /></button></div>
        {addingFolder && <div className="folder-create"><input autoFocus value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitFolder(); if (event.key === 'Escape') setAddingFolder(false) }} placeholder="文件夹名称" /><button onClick={() => setAddingFolder(false)}><X size={13} /></button></div>}
        <nav className="sidebar-nav folders">
          {folders.filter((folder) => !folder.deletedAt && !folder.parentId).sort((a, b) => a.order - b.order).map((folder) => <FolderTreeRow key={folder.id} folder={folder} folders={folders} documents={documents} filter={filter} depth={0} setFilter={setFilter} />)}
        </nav>
        {tags.length > 0 && <><div className="sidebar-section-title"><span>标签</span></div><nav className="sidebar-nav tag-nav">{tags.slice(0, 8).map((tag) => <button key={tag} className={filter === `tag:${tag}` ? 'active' : ''} onClick={() => setFilter(`tag:${tag}`)}><Tag size={15} />{tag}</button>)}</nav></>}
        <div className="sidebar-spacer" />
        <nav className="sidebar-nav"><button className={filter === 'trash' ? 'active' : ''} onClick={() => setFilter('trash')}><Trash2 size={17} />回收站<span>{documents.filter((item) => item.deletedAt).length || ''}</span></button></nav>
        <div className="profile-chip"><span>{(user.name ?? '知').slice(0, 1)}</span><div><strong>{user.name ?? '本地用户'}</strong><small>资料保存在此浏览器</small></div><HardDrive size={14} /></div>
      </aside>
      <main className="library-main">
        <header className="library-header"><div><p className="eyebrow">知识库</p><h1>{heading}</h1><p className="library-subtitle">{subtitle}</p></div><div className="library-header-actions"><BackupDialog />{filter !== 'trash' && <button className="primary-button" onClick={create}><Plus size={17} />新建思维导图</button>}</div></header>
        <section className="library-overview" aria-label="知识库概览">
          <div><FileText size={17} /><span><strong>{activeDocuments.length}</strong> 份导图</span></div>
          <div><GitBranch size={17} /><span><strong>{totalNodeCount}</strong> 个节点</span></div>
          <div><Folder size={17} /><span><strong>{activeFolderCount}</strong> 个文件夹</span></div>
          <div className="library-overview-tip"><BookOpen size={17} /><span>打开导图后，可把 PDF 直接拖到主题上</span></div>
          <div className="library-overview-safe"><ShieldCheck size={16} />自动保存到本地</div>
        </section>
        <div className="library-toolbar"><label className="search-field"><Search size={17} /><input aria-label="搜索文档" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、节点、标签或笔记…" /></label><div className="view-switch"><button className={viewMode === 'list' ? 'active' : ''} aria-label="列表视图" onClick={() => changeViewMode('list')}><List size={17} /></button><button className={viewMode === 'grid' ? 'active' : ''} aria-label="卡片视图" onClick={() => changeViewMode('grid')}><LayoutGrid size={17} /></button></div></div>
        <section className={viewMode === 'grid' ? 'document-grid' : 'document-list'}>
          {viewMode === 'list' && <div className="document-list-head"><span>名称</span><span>文件夹</span><span>最近修改</span><span /></div>}
          {visibleDocuments.map((document) => <DocumentRow key={document.id} document={document} folders={folders} inTrash={filter === 'trash'} open={open} viewMode={viewMode} />)}
          {!visibleDocuments.length && <div className="empty-state"><Search size={24} /><strong>{filter === 'trash' ? '回收站是空的' : '没有找到相关内容'}</strong><span>{filter === 'trash' ? '删除的文档会暂存在这里' : '试试更短的关键词'}</span></div>}
        </section>
      </main>
    </div>
  )
}
