import MindElixir, {
  type MindElixirData,
  type NodeObj,
  type Operation,
  type Topic,
} from 'mind-elixir'
import type { NodeData, NodeStyle, TaskStatus } from '../../types/mindmap'
import { downloadBlob } from '../../services/export/download'
import { plainTextFromRichText } from '../../utils/richText'

interface EngineMetadata {
  createdAt: string
  updatedAt: string
  order: number
  taskStatus: TaskStatus
  note: string
  attachments: NodeData['attachments']
  style: NodeStyle
  code?: string
  formula?: string
  icon?: string
  richText?: string
}

interface AdapterEvents {
  onSelectionChange: (id?: string) => void
  onTreeChange: (root: NodeData, operation: Operation | { name: 'expandNode' }) => void
}

export interface NodeAnchor {
  id: string
  left: number
  top: number
  width: number
  height: number
  hasChildren: boolean
  collapsed: boolean
}

const defaultMetadata = (): EngineMetadata => ({
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  order: 0, taskStatus: 'none', note: '', attachments: [], style: {},
})

export class MindMapEngineAdapter {
  private engine: MindElixir<EngineMetadata>
  private disposed = false

  constructor(element: HTMLElement, events: AdapterEvents) {
    this.engine = new MindElixir<EngineMetadata>({
      el: element,
      direction: MindElixir.RIGHT,
      editable: true,
      contextMenu: false,
      toolBar: false,
      keypress: false,
      mouseSelectionButton: 0,
      allowUndo: false,
      overflowHidden: false,
      alignment: 'nodes',
      theme: {
        name: 'Paper',
        type: 'light',
        palette: ['#768a7a', '#8a7d70', '#707f8d', '#8c7d88'],
        cssVar: {
          '--node-gap-x': '40px', '--node-gap-y': '13px',
          '--main-gap-x': '72px', '--main-gap-y': '20px',
          '--main-color': '#24332b', '--main-bgcolor': '#ffffff',
          '--main-bgcolor-transparent': 'rgba(255,255,255,.8)',
          '--main-border': '1px solid #dfe4df', '--color': '#38443d',
          '--bgcolor': '#ffffff', '--selected': '#dbe8df',
          '--accent-color': '#718779', '--root-color': '#f8faf8',
          '--root-bgcolor': '#263b30', '--root-border-color': '#263b30',
          '--root-radius': '10px', '--main-radius': '7px',
          '--topic-padding': '8px 12px', '--panel-color': '#354239',
          '--panel-bgcolor': '#ffffff', '--panel-border-color': '#e3e8e4',
          '--map-padding': '72px',
        },
      },
    })

    this.engine.bus.addListener('selectNodes', (nodes) => events.onSelectionChange(nodes.at(-1)?.id))
    this.engine.bus.addListener('selectNewNode', (node) => events.onSelectionChange(node.id))
    this.engine.bus.addListener('unselectNodes', () => {
      if (!this.engine.currentNodes.length) events.onSelectionChange(undefined)
    })
    this.engine.bus.addListener('operation', (operation) => {
      if (this.disposed || operation.name === 'beginEdit') return
      events.onTreeChange(this.getTree(), operation)
    })
    this.engine.bus.addListener('expandNode', () => {
      if (!this.disposed) events.onTreeChange(this.getTree(), { name: 'expandNode' })
    })
  }

  async init(root: NodeData) {
    await this.engine.init(this.toEngineData(root))
    this.engine.toCenter()
  }

  render(root: NodeData) {
    if (this.disposed) return
    this.engine.refresh(this.toEngineData(root))
  }

  destroy() {
    this.disposed = true
    this.engine.destroy()
  }

  beginEdit(id: string, caretPoint?: { x: number; y: number }) {
    const element = this.safeFind(id)
    if (!element) return
    void this.engine.beginEdit(element).then(() => {
      if (!caretPoint) return
      requestAnimationFrame(() => {
        const input = this.engine.nodes.querySelector<HTMLElement>('#input-box')
        if (!input) return
        input.focus()
        const caretDocument = document as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
          caretRangeFromPoint?: (x: number, y: number) => Range | null
        }
        const position = caretDocument.caretPositionFromPoint?.(caretPoint.x, caretPoint.y)
        let range: Range | undefined
        if (position && input.contains(position.offsetNode)) {
          range = document.createRange()
          range.setStart(position.offsetNode, position.offset)
          range.collapse(true)
        } else {
          const fallback = caretDocument.caretRangeFromPoint?.(caretPoint.x, caretPoint.y)
          if (fallback && input.contains(fallback.startContainer)) {
            fallback.collapse(true)
            range = fallback
          }
        }
        if (range) {
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      })
    })
  }

  select(id: string) {
    const element = this.safeFind(id)
    if (element) this.engine.selectNode(element)
  }

  reveal(id: string) {
    const element = this.safeFind(id)
    if (!element) return
    this.engine.selectNode(element)
    this.engine.scrollIntoView(element, true)
  }

  clearSelection() {
    this.engine.clearSelection()
  }

  toggleExpanded(id: string) {
    const element = this.safeFind(id)
    if (element) this.engine.expandNode(element, element.nodeObj.expanded === false)
  }

  focus(id: string) {
    const element = this.safeFind(id)
    if (element) this.engine.focusNode(element)
  }

  fit() {
    this.engine.scaleFit()
    return this.engine.scaleVal
  }
  center() { this.engine.toCenter() }
  panBy(x: number, y: number) { this.engine.move(x, y) }

  getScale() { return this.engine.scaleVal }

  zoomBy(delta: number) {
    const next = Math.min(2, Math.max(.4, Math.round((this.engine.scaleVal + delta) * 10) / 10))
    this.engine.scale(next)
    return next
  }

  async exportPng(fileName: string) {
    const selected = [...this.engine.currentNodes]
    this.engine.clearSelection()
    try {
      const { exportImageBlob } = await import('@mind-elixir/export-mindmap')
      const blob = await exportImageBlob(this.engine, 'png', {
        scale: 2,
        backgroundColor: '#ffffff',
        watermarkEnabled: false,
      })
      downloadBlob(blob, `${fileName || '思维导图'}.png`)
    } finally {
      selected.forEach((node) => this.engine.selectNode(node))
    }
  }

  resolveNode(target: EventTarget | null): NodeAnchor | undefined {
    if (!(target instanceof Element)) return
    const element = target.closest<HTMLElement>('.me-tpc') as Topic<EngineMetadata> | null
    if (!element?.nodeObj) return
    return this.anchorFor(element.nodeObj.id)
  }

  anchorFor(id: string): NodeAnchor | undefined {
    const element = this.safeFind(id)
    if (!element) return
    const rect = element.getBoundingClientRect()
    return {
      id, left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      hasChildren: Boolean(element.nodeObj.children?.length),
      collapsed: element.nodeObj.expanded === false,
    }
  }

  getTree(): NodeData {
    return this.fromEngineNode(this.engine.getData().nodeData)
  }

  private safeFind(id: string): Topic<EngineMetadata> | undefined {
    try { return this.engine.findEle(id) } catch { return undefined }
  }

  private toEngineData(root: NodeData): MindElixirData<EngineMetadata> {
    return { nodeData: this.toEngineNode(root), direction: MindElixir.RIGHT }
  }

  private toEngineNode(node: NodeData): NodeObj<EngineMetadata> {
    const style = {
      color: node.style.color,
      background: node.style.background,
      fontWeight: node.style.fontWeight,
      textDecoration: node.style.textDecoration,
    }
    return {
      id: node.id,
      topic: node.title,
      expanded: !node.collapsed,
      children: node.children.map((child) => this.toEngineNode(child)),
      tags: node.tags,
      icons: [
        node.taskStatus === 'todo' ? '☐' : node.taskStatus === 'doing' ? '◒' : node.taskStatus === 'done' ? '☑' : undefined,
        node.icon,
        node.note ? '▤' : undefined,
        node.code ? '⌘' : undefined,
        node.formula ? '∑' : undefined,
        node.attachments.length ? '📎' : undefined,
      ].filter((value): value is string => Boolean(value)),
      hyperLink: node.hyperlink,
      image: node.image,
      style,
      metadata: {
        createdAt: node.createdAt, updatedAt: node.updatedAt, order: node.order,
        taskStatus: node.taskStatus, note: node.note,
        attachments: node.attachments, style: node.style, code: node.code, formula: node.formula, icon: node.icon,
        richText: node.richText,
      },
    }
  }

  private fromEngineNode(node: NodeObj<EngineMetadata>, order = 0): NodeData {
    const metadata = node.metadata ?? defaultMetadata()
    return {
      id: node.id, title: node.topic,
      richText: metadata.richText && plainTextFromRichText(metadata.richText) === node.topic ? metadata.richText : undefined,
      collapsed: node.expanded === false, order,
      createdAt: metadata.createdAt, updatedAt: new Date().toISOString(),
      style: metadata.style, tags: (node.tags ?? []).map((tag) => typeof tag === 'string' ? tag : tag.text),
      taskStatus: metadata.taskStatus, hyperlink: node.hyperLink, note: metadata.note,
      icon: metadata.icon, image: node.image, attachments: metadata.attachments,
      code: metadata.code, formula: metadata.formula,
      children: (node.children ?? []).map((child, index) => this.fromEngineNode(child, index)),
    }
  }
}
