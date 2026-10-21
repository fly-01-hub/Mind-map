import { test, expect, type Page } from './fixtures'
import { connectorError } from './connectorChecks'

async function seedLargeMap(page: Page) {
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const { createNode } = await import('/src/utils/tree.ts')
    const root = createNode('大型导图连线回归测试')
    root.id = 'large-root'
    const paragraph = '球面上的采样点并不构成普通图像中的平面规则网格，因此需要在采样密度、局部方向和计算复杂度之间进行权衡。理解这些约束之后，才能判断不同网络结构适用于什么样的图像和任务。'
    root.children = Array.from({ length: 12 }, (_, i) => {
      const branch = createNode(`技术路线 ${i + 1}\n\n${paragraph.repeat(2)}`)
      branch.id = `branch-${i}`
      branch.children = Array.from({ length: 8 }, (_, j) => {
        const section = createNode(`方法 ${i + 1}.${j + 1}`)
        section.id = `section-${i}-${j}`
        section.children = Array.from({ length: 10 }, (_, k) => {
          const node = createNode(k % 3 ? `文献 ${k + 1}` : `问题与解释\n\n${paragraph.repeat(2)}`)
          if (k === 0 && j === 0) node.image = {
            url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240"><rect width="720" height="240" fill="#dbe8df"/></svg>'),
            width: 720, height: 240,
          }
          return node
        })
        return section
      })
      return branch
    })
    const store = useDocumentStore.getState()
    const document = { ...store.documents.find((item) => item.id === 'test-map')!, root }
    store.hydrate(store.documents.map((item) => item.id === document.id ? document : item), store.folders)
    const { flushLocalPersistence } = await import('/src/services/persistence/localPersistence.ts')
    await flushLocalPersistence()
  })
}

test('large maps keep connectors aligned after rich content, edits and folding', async ({ page }) => {
  await seedLargeMap(page)
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(1069)
  await page.getByTitle('恢复100%阅读大小').click()
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.getByTitle('恢复100%阅读大小').click()
  expect((await connectorError(page)).count).toBeGreaterThan(1000)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    useDocumentStore.getState().updateNode('section-0-0', { title: '编辑后增长的段落。'.repeat(80) })
  })
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    useDocumentStore.getState().toggleCollapsed('branch-0')
  })
  await expect(page.locator('.me-tpc')).toHaveCount(981)
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    useDocumentStore.getState().toggleCollapsed('branch-0')
  })
  await expect(page.locator('.me-tpc')).toHaveCount(1069)
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    useDocumentStore.getState().updateMapAppearance('test-map', { compactMap: true, mapTheme: 'ocean' })
  })
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
})

test('new rich-text topics and delayed image resizing update connectors without idle redraws', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByTitle('恢复100%阅读大小').click()
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const store = useDocumentStore.getState()
    const root = store.documents.find((item) => item.id === 'test-map')!.root
    // Use native inline commit, rather than only the React update path.
    store.revealNode(root.children[0].id)
  })
  const topic = page.locator('.me-tpc', { hasText: '分支甲项' }).first()
  await topic.dblclick()
  const editor = page.locator('#input-box[contenteditable]')
  await editor.fill('编辑后成为长段落。'.repeat(30))
  await editor.press('Enter')
  await expect(page.locator('.me-tpc.paragraph-topic')).toHaveCount(1)
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const store = useDocumentStore.getState()
    const root = store.documents.find((item) => item.id === 'test-map')!.root
    store.insertChild(root.children[0].id, '新建长段落节点。'.repeat(30))
  })
  await expect(page.locator('.me-tpc.paragraph-topic')).toHaveCount(2)
  // Simulate an intrinsic media resize after the initial render. There is no
  // store edit here, so only the live size observer can repair these paths.
  await page.evaluate(async () => {
    const node = document.querySelector('.me-children .me-tpc.paragraph-topic .text')!
    const image = document.createElement('img')
    image.style.cssText = 'display:block;width:160px;height:250px'
    node.append(image)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  await expect.poll(async () => (await connectorError(page)).max).toBeLessThan(2)
  const idleDraws = await page.evaluate(async () => {
    let count = 0
    const observer = new MutationObserver((records) => { count += records.length })
    observer.observe(document.querySelector('.lines')!, { childList: true })
    await new Promise((resolve) => setTimeout(resolve, 350))
    observer.disconnect()
    return count
  })
  expect(idleDraws).toBe(0)
  expect(errors).toEqual([])
})
