import MindElixir, {
  type MindElixirData,
  type NodeObj,
  type Operation,
  type Theme,
  type Topic,
} from 'mind-elixir'
import type { MapArrow, MapSummary, MindMapDocument, NodeData, NodeStyle, TaskStatus } from '../../types/mindmap'
import { downloadBlob } from '../../services/export/download'
import { compactRichText, plainTextFromRichText, richTextFromPlain, sanitizeRichText } from '../../utils/richText'
import { clearWikiEditor, decorateWikiLinks, highlightWikiEditor } from '../../utils/wikiLinks'
import { minimalViewportPan } from '../../utils/viewportPan'

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
  table?: NodeData['table']
}

interface AdapterEvents {
  onSelectionChange: (ids: string[]) => void
  onMapChange: (root: NodeData, arrows: MapArrow[], summaries: MapSummary[], operation: Operation | { name: 'expandNode' }) => void
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

const baseCss: NonNullable<Theme<EngineMetadata>['cssVar']> = {
  '--node-gap-x': '40px', '--node-gap-y': '13px', '--main-gap-x': '72px', '--main-gap-y': '20px',
  '--main-color': '#24332b', '--main-bgcolor': '#ffffff', '--main-bgcolor-transparent': 'rgba(255,255,255,.8)',
  '--main-border': '1px solid #dfe4df', '--color': '#38443d', '--bgcolor': '#ffffff', '--selected': '#dbe8df',
  '--accent-color': '#718779', '--root-color': '#f8faf8', '--root-bgcolor': '#263b30', '--root-border-color': '#263b30',
  '--root-radius': '10px', '--main-radius': '7px', '--topic-padding': '8px 12px', '--panel-color': '#354239',
  '--panel-bgcolor': '#ffffff', '--panel-border-color': '#e3e8e4', '--map-padding': '72px',
}

const mapThemes: Record<'paper' | 'ocean' | 'warm' | 'mono', Theme<EngineMetadata>> = {
  paper: { name: 'Paper', type: 'light', palette: ['#768a7a', '#8a7d70', '#707f8d', '#8c7d88'], cssVar: baseCss },
  ocean: { name: 'Ocean', type: 'light', palette: ['#4c7890', '#5d8d87', '#6c7fa0', '#4f8c9c'], cssVar: { ...baseCss, '--root-bgcolor': '#28566b', '--root-border-color': '#28566b', '--accent-color': '#4c7890', '--selected': '#dcecf2' } },
  warm: { name: 'Warm', type: 'light', palette: ['#a77255', '#a98955', '#916a68', '#8e765f'], cssVar: { ...baseCss, '--root-bgcolor': '#6b4635', '--root-border-color': '#6b4635', '--accent-color': '#9a6b50', '--selected': '#f2e5dc' } },
  mono: { name: 'Mono', type: 'light', palette: ['#68716c', '#7a817d', '#59615d', '#8a908d'], cssVar: { ...baseCss, '--root-bgcolor': '#343a36', '--root-border-color': '#343a36', '--accent-color': '#6b736e', '--selected': '#e4e7e5' } },
}

export class MindMapEngineAdapter {
  private engine: MindElixir<EngineMetadata>
  private events: AdapterEvents
  private disposed = false
  private refreshing = false
  private sourceCounts: Record<string, number> = {}
  private documents: MindMapDocument[] = []
  private readonly host: HTMLElement
  private stopEditVisibility?: () => void
  private viewportResize: ResizeObserver
  private viewportResizeFrame = 0

  setDocuments(documents: MindMapDocument[]) {
    this.documents = documents
    this.applyRichText()
  }

  finishEdit() {
    this.engine.nodes.querySelector<HTMLElement>('#input-box[contenteditable]')?.blur()
  }

  setSourceCounts(counts: Record<string, number>) {
    this.sourceCounts = counts
    this.applyRichText()
  }

  constructor(element: HTMLElement, events: AdapterEvents) {
    this.host = element
    this.events = events
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
      theme: mapThemes.paper,
    })

    // Engine pointer selection calls scrollIntoView and recentres edge topics.
    // Selection is not navigation. Only explicit reveal retains that behaviour;
    // inline editing uses our minimal, viewport-aware pan below instead.
    const engineReveal = this.engine.scrollIntoView.bind(this.engine)
    this.engine.scrollIntoView = (target, forceCenter = false) => {
      if (forceCenter) engineReveal(target, true)
    }
    this.viewportResize = new ResizeObserver(() => {
      cancelAnimationFrame(this.viewportResizeFrame)
      this.viewportResizeFrame = requestAnimationFrame(() => {
        if (this.disposed) return
        const editor = this.host.querySelector<HTMLElement>('#input-box[contenteditable]')
        if (editor) this.keepContentVisible(editor)
        else if (this.engine.currentNode) {
          const rect = this.engine.currentNode.getBoundingClientRect()
          const host = this.host.getBoundingClientRect()
          // Selection may change toolbar/header size. Do not turn that into
          // an auto-pan for a visible or partially visible clicked topic.
          if (rect.bottom < host.top || rect.top > Math.min(host.bottom, innerHeight)
            || rect.right < Math.max(host.left, 0) || rect.left > Math.min(host.right, innerWidth)) {
            this.keepContentVisible(this.engine.currentNode)
          }
        }
      })
    })
    this.viewportResize.observe(this.host)

    this.engine.bus.addListener('selectNodes', () => {
      if (!this.refreshing) events.onSelectionChange(this.engine.currentNodes.map((node) => node.nodeObj.id))
    })
    this.engine.bus.addListener('selectNewNode', (node) => {
      if (!this.refreshing) events.onSelectionChange([node.id])
    })
    this.engine.bus.addListener('unselectNodes', () => {
      if (!this.refreshing) events.onSelectionChange(this.engine.currentNodes.map((node) => node.nodeObj.id))
    })
    this.engine.bus.addListener('operation', (operation) => {
      if (this.disposed || operation.name === 'beginEdit') return
      const map = this.getMap()
      events.onMapChange(map.root, map.arrows, map.summaries, operation)
    })
    this.engine.bus.addListener('expandNode', () => {
      if (!this.disposed) {
        const map = this.getMap()
        events.onMapChange(map.root, map.arrows, map.summaries, { name: 'expandNode' })
      }
    })
  }

  async init(root: NodeData, arrows: MapArrow[] = [], summaries: MapSummary[] = []) {
    await this.engine.init(this.toEngineData(root, arrows, summaries))
    this.applyRichText()
    requestAnimationFrame(() => this.applyRichText())
    this.engine.toCenter()
  }

  render(root: NodeData, arrows: MapArrow[] = [], summaries: MapSummary[] = []) {
    if (this.disposed || !this.engine.nodeData) return
    const selection = this.engine.currentNodes.map((node) => node.nodeObj.id)
    const anchor = this.captureLayoutAnchor()
    const rootChanged = this.engine.nodeData.id !== root.id
    this.refreshing = true
    try {
      this.engine.refresh(this.toEngineData(root, arrows, summaries))
      this.applyRichText()
      // Replacing the displayed tree (import / focus navigation) is deliberate
      // navigation. Its old anchor no longer exists and must not strand the
      // new root off-screen. Ordinary edits keep the existing screen anchor.
      if (rootChanged) this.engine.toCenter()
      else this.restoreLayoutAnchor(anchor)
      requestAnimationFrame(() => {
        if (this.disposed) return
        const currentAnchor = this.captureLayoutAnchor()
        this.applyRichText()
        this.restoreLayoutAnchor(currentAnchor)
      })
      if (selection.length) this.setSelections(selection)
    } finally {
      this.refreshing = false
    }
  }

  destroy() {
    this.stopEditVisibility?.()
    this.viewportResize.disconnect()
    cancelAnimationFrame(this.viewportResizeFrame)
    const editor = this.engine.nodes.querySelector<HTMLElement>('#input-box[contenteditable]')
    if (editor) clearWikiEditor(editor)
    this.disposed = true
    this.engine.destroy()
  }

  beginEdit(id: string, caretPoint?: { x: number; y: number }) {
    const element = this.safeFind(id)
    if (!element) return
    void this.engine.beginEdit(element).then(() => {
      if (this.disposed) return
      const input = this.engine.nodes.querySelector<HTMLElement>('#input-box')
      if (!input) return
      input.dataset.editingNodeId = id
      this.stopEditVisibility?.()
      this.stopEditVisibility = this.watchEditVisibility(input)
      const metadata = element.nodeObj.metadata ?? defaultMetadata()
      const originalRichText = metadata.richText
      let cancelled = false
      element.nodeObj.metadata = metadata
      input.contentEditable = 'true'
      input.innerHTML = originalRichText ?? richTextFromPlain(element.nodeObj.topic)
      highlightWikiEditor(input)
      const syncRichText = () => {
        metadata.richText = compactRichText(sanitizeRichText(input.innerHTML), input.innerText.trim())
        if (!composing) highlightWikiEditor(input)
      }
      let composing = false
      input.addEventListener('compositionstart', () => { composing = true })
      input.addEventListener('compositionend', () => { composing = false; syncRichText() })
      input.addEventListener('input', syncRichText)
      input.addEventListener('keyup', syncRichText)
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') cancelled = true
      }, { capture: true })
      input.addEventListener('blur', () => {
        const anchor = this.captureLayoutAnchor(id)
        this.stopEditVisibility?.()
        this.stopEditVisibility = undefined
        // The engine commits and reflows in its non-capture blur listener.
        // Preserve the edited topic's top-left, not the whole map's centre.
        queueMicrotask(() => {
          if (!this.disposed) this.restoreLayoutAnchor(anchor)
        })
        clearWikiEditor(input)
        if (cancelled) metadata.richText = originalRichText
        else {
          syncRichText()
          const plainText = input.innerText.trim()
          if (metadata.richText !== originalRichText && plainText === element.nodeObj.topic) {
            queueMicrotask(() => {
              if (this.disposed) return
              const map = this.getMap()
              this.events.onMapChange(map.root, map.arrows, map.summaries, {
                name: 'finishEdit', target: element.nodeObj, origin: element.nodeObj.topic,
              })
            })
          }
        }
      }, { capture: true, once: true })
      if (!caretPoint) {
        const range = document.createRange()
        range.selectNodeContents(input)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return
      }
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true })
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
    if (!element || (this.engine.currentNodes.length === 1 && this.engine.currentNodes[0] === element)) return
    this.engine.selectNode(element)
  }

  setSelections(ids: string[]) {
    this.engine.currentNodes.forEach((node) => node.classList.remove('selected'))
    const nodes = ids.map((id) => this.safeFind(id)).filter((node): node is Topic<EngineMetadata> => Boolean(node))
    // Refresh replaces topic elements. Keep the engine's selection-area cache
    // in sync as well, so adding a child cannot retain the old parent selection.
    this.engine.selection?.clearSelection(true, true)
    this.engine.selection?.select(nodes, true)
    nodes.forEach((node) => node.classList.add('selected'))
    this.engine.currentNodes = nodes
  }

  reveal(id: string) {
    const element = this.safeFind(id)
    if (!element) return
    // Reveal is an explicit navigation, not an additive selection gesture.
    this.setSelections([id])
    this.events.onSelectionChange([id])
    this.engine.scrollIntoView(element, true)
  }

  clearSelection() {
    if (!this.engine.currentNodes.length && !this.engine.currentArrow && !this.engine.currentSummary) return
    this.engine.clearSelection()
  }

  setAppearance(theme: 'paper' | 'ocean' | 'warm' | 'mono', compact: boolean) {
    const selection = this.engine.currentNodes.map((node) => node.nodeObj.id)
    const anchor = this.captureLayoutAnchor()
    this.refreshing = true
    try {
      this.engine.changeTheme(mapThemes[theme], true)
      this.engine.changeCompact(compact)
      this.applyRichText()
      this.restoreLayoutAnchor(anchor)
      this.setSelections(selection)
    } finally {
      this.refreshing = false
    }
  }

  setReadOnly(readOnly: boolean) {
    if (readOnly) this.engine.disableEdit()
    else this.engine.enableEdit()
  }

  createSummary() {
    const nodes = [...this.engine.currentNodes]
    if (nodes.length < 2) return false
    const parentIds = new Set(nodes.map((node) => node.nodeObj.parent?.id))
    if (parentIds.size !== 1 || parentIds.has(undefined)) return false
    this.engine.createSummary()
    return true
  }

  createArrow(bidirectional = false) {
    const nodes = [...this.engine.currentNodes]
    if (nodes.length !== 2) return false
    this.engine.createArrow(nodes[0], nodes[1], { bidirectional })
    return true
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

  beginBoxSelection(event: PointerEvent) {
    // Mind Elixir starts its marquee only when the original pointer target is
    // exactly `.map-container`. Connector SVGs and other transparent map
    // layers can cover visually blank canvas, so replay the pointer-down on
    // the real container while the physical pointer is still active.
    const forwarded = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: 0,
      buttons: 1,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    })
    this.engine.container.dispatchEvent(forwarded)
    // The engine and the selection plug-in both subscribe to pointerdown. In
    // some browsers the plug-in observes the replay before the engine has set
    // BoxSelect state, so explicitly trigger once after state initialization.
    this.engine.selection.trigger(forwarded)
  }

  panBy(x: number, y: number) {
    // Mind Elixir deliberately clamps panning once the map's bounds reach the
    // viewport centre. Mubu-style canvas navigation is free-form, so move the
    // transformed map directly and keep the current zoom unchanged.
    const transform = getComputedStyle(this.engine.map).transform
    const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : new DOMMatrixReadOnly()
    this.engine.map.style.transform = `translate3d(${matrix.m41 + x}px, ${matrix.m42 + y}px, 0) scale(${this.engine.scaleVal})`
  }

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
    // The engine hides the original topic while a separate, auto-sized editor
    // is active. Measuring that old topic places the controls over new text.
    const editor = this.engine.nodes.querySelector<HTMLElement>('#input-box[contenteditable]')
    const rect = (editor?.dataset.editingNodeId === id ? editor : element).getBoundingClientRect()
    return {
      id, left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      hasChildren: Boolean(element.nodeObj.children?.length),
      collapsed: element.nodeObj.expanded === false,
    }
  }

  watchAnchor(id: string, onChange: (anchor: NodeAnchor | undefined) => void) {
    let frame = 0
    let stopped = false
    let topic: HTMLElement | undefined
    let editor: HTMLElement | null = null
    const schedule = () => {
      if (stopped || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!this.disposed) onChange(this.anchorFor(id))
      })
    }
    const resize = new ResizeObserver(schedule)
    const bind = () => {
      const nextTopic = this.safeFind(id)
      const nextEditor = this.host.querySelector<HTMLElement>('#input-box[contenteditable]')
      if (topic !== nextTopic || editor !== nextEditor) {
        resize.disconnect()
        resize.observe(this.host)
        if (nextTopic) resize.observe(nextTopic)
        if (nextEditor) resize.observe(nextEditor)
        topic = nextTopic
        editor = nextEditor
      }
      schedule()
    }
    // Includes editor creation/removal, re-layout and map transforms (zoom/pan).
    // Batch measurements once per changed frame, with no idle polling or writes
    // to the contenteditable DOM / caret / document data.
    const mutations = new MutationObserver(bind)
    mutations.observe(this.host, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['style', 'class', 'data-editing-node-id'],
    })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    bind()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }

  getTree(): NodeData {
    return this.fromEngineNode(this.engine.getData().nodeData)
  }

  getMap(): { root: NodeData; arrows: MapArrow[]; summaries: MapSummary[] } {
    const data = this.engine.getData()
    return {
      root: this.fromEngineNode(data.nodeData),
      arrows: structuredClone((data.arrows ?? []) as MapArrow[]),
      summaries: structuredClone(data.summaries ?? []),
    }
  }

  private safeFind(id: string): Topic<EngineMetadata> | undefined {
    try { return this.engine.findEle(id) } catch { return undefined }
  }

  private captureLayoutAnchor(id = this.engine.currentNode?.nodeObj.id ?? this.engine.nodeData?.id) {
    if (!id || this.disposed) return undefined
    const rect = this.safeFind(id)?.getBoundingClientRect()
    return rect ? { id, left: rect.left, top: rect.top } : undefined
  }

  private restoreLayoutAnchor(anchor?: { id: string; left: number; top: number }) {
    if (!anchor) return
    const rect = this.safeFind(anchor.id)?.getBoundingClientRect()
    if (rect && (Math.abs(anchor.left - rect.left) > .01 || Math.abs(anchor.top - rect.top) > .01)) {
      this.panBy(anchor.left - rect.left, anchor.top - rect.top)
    }
  }

  private watchEditVisibility(input: HTMLElement) {
    let frame = 0
    const schedule = () => {
      if (frame || this.disposed) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!this.disposed && input.isConnected) this.keepContentVisible(input)
      })
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(input)
    input.addEventListener('input', schedule)
    input.addEventListener('keyup', schedule)
    input.addEventListener('compositionend', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      input.removeEventListener('input', schedule)
      input.removeEventListener('keyup', schedule)
      input.removeEventListener('compositionend', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.removeEventListener('resize', schedule)
    }
  }

  private keepContentVisible(input: HTMLElement) {
    const host = this.host.getBoundingClientRect()
    const visual = window.visualViewport
    const viewport = {
      left: Math.max(host.left, visual?.offsetLeft ?? 0) + 16,
      top: Math.max(host.top, visual?.offsetTop ?? 0) + 16,
      right: Math.min(host.right, (visual?.offsetLeft ?? 0) + (visual?.width ?? innerWidth)) - 16,
      bottom: Math.min(host.bottom, (visual?.offsetTop ?? 0) + (visual?.height ?? innerHeight)) - 16,
    }
    const toolbar = this.host.closest('.editor-body')?.querySelector('.map-selection-toolbar')
      ?? document.querySelector('.map-selection-toolbar')
    const toolbarRect = toolbar?.getBoundingClientRect()
    if (toolbarRect && toolbarRect.width && toolbarRect.top > viewport.top) {
      viewport.bottom = Math.min(viewport.bottom, toolbarRect.top - 12)
    }
    const rect = input.getBoundingClientRect()
    let target = { left: rect.left, top: rect.top, right: rect.right + 40, bottom: rect.bottom }
    // A very long topic cannot fit as a whole: follow the insertion point on
    // that axis instead. Never alter the DOM, selection, IME or zoom here.
    const selection = window.getSelection()
    if (selection?.rangeCount && input.contains(selection.focusNode)) {
      const caret = document.createRange()
      caret.setStart(selection.focusNode!, selection.focusOffset)
      caret.collapse(true)
      let caretRect = caret.getBoundingClientRect()
      if (!caretRect.height && selection.focusNode?.nodeType === Node.TEXT_NODE && selection.focusOffset > 0) {
        caret.setStart(selection.focusNode, selection.focusOffset - 1)
        caretRect = caret.getBoundingClientRect()
      }
      if (caretRect.height) {
        if (target.right - target.left > viewport.right - viewport.left) {
          target = { ...target, left: caretRect.left, right: caretRect.right + 12 }
        }
        if (target.bottom - target.top > viewport.bottom - viewport.top) {
          target = { ...target, top: caretRect.top, bottom: caretRect.bottom }
        }
      }
    }
    const delta = minimalViewportPan(target, viewport)
    if (Math.abs(delta.x) > .5 || Math.abs(delta.y) > .5) this.panBy(delta.x, delta.y)
  }

  private applyRichText() {
    if (this.disposed) return
    this.engine.nodes.querySelectorAll<HTMLElement>('.me-tpc').forEach((topic) => {
      const element = topic as Topic<EngineMetadata>
      const richText = element.nodeObj?.metadata?.richText
      const text = topic.querySelector<HTMLElement>(':scope > .text')
      if (text) text.innerHTML = decorateWikiLinks(richText ?? richTextFromPlain(element.nodeObj.topic), this.documents)
      topic.querySelector(':scope > .node-source-badge')?.remove()
      const count = this.sourceCounts[element.nodeObj?.id]
      if (count) {
        const badge = document.createElement('button')
        badge.type = 'button'; badge.className = 'node-source-badge'
        badge.dataset.sourceNodeId = element.nodeObj.id
        badge.textContent = `📄${count}`
        badge.setAttribute('aria-label', `查看 ${count} 条论文来源`)
        badge.title = '查看来源并在导图旁定位原文'
        topic.append(badge)
      }
    })
  }

  private toEngineData(root: NodeData, arrows: MapArrow[], summaries: MapSummary[]): MindElixirData<EngineMetadata> {
    const ids = new Set<string>()
    const collect = (node: NodeData) => {
      ids.add(node.id)
      node.children.forEach(collect)
    }
    collect(root)
    return {
      nodeData: this.toEngineNode(root),
      arrows: structuredClone(arrows.filter((arrow) => ids.has(arrow.from) && ids.has(arrow.to))),
      summaries: structuredClone(summaries.filter((summary) => ids.has(summary.parent))),
      direction: MindElixir.RIGHT,
    }
  }

  private toEngineNode(node: NodeData): NodeObj<EngineMetadata> {
    const style = {
      color: node.style.color,
      background: node.style.background,
      fontWeight: node.style.fontWeight,
      fontStyle: node.style.fontStyle,
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
        node.table ? '▦' : undefined,
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
        table: node.table,
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
      table: metadata.table,
      children: (node.children ?? []).map((child, index) => this.fromEngineNode(child, index)),
    }
  }
}
