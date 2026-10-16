import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import sharp from 'sharp'
import { expect, test } from './fixtures'
import { createTestPdf } from './testPdf'

test('adds a study package, preserves existing maps, opens its PDF, and skips duplicate imports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const pdf = createTestPdf()
  const node = (id: string, title: string, children: unknown[] = []) => ({ id, title, children })
  const zip = new JSZip()
  const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#dce9e1' } }).png().toBuffer()
  const paragraph = '计算原理\n\n' + '每个输出方向先根据夹角寻找球面邻居，再使用学习到的核权重聚合特征；相机投影和邻域表在几何关系固定时可以预先计算。'.repeat(4)
  const diagram = { ...node('diagram', '球面邻域示意图'), image: { url: `data:image/png;base64,${png.toString('base64')}`, width: 720, height: 360 } }
  zip.file('pdfs/example.pdf', pdf)
  zip.file('manifest.json', JSON.stringify({
    format: 'researchmind-study', version: 1, id: 'browser-study-test', title: '文献资料包测试',
    root: node('root', '文献资料包测试', [node('paper', '论文节点', [node('summary', '摘要：测试内容')]), node('paragraph', paragraph), diagram]),
    papers: [{ key: 'P01', title: 'Study example', file: 'pdfs/example.pdf', bytes: pdf.length, pageCount: 2,
      sha256: createHash('sha256').update(pdf).digest('hex') }],
    links: [{ nodeId: 'paper', paperKey: 'P01' }],
  }))
  const file = { name: 'test.rmstudy', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) }
  const original = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    return appDatabase.documents.get('test-map')
  })
  await page.getByRole('button', { name: '备份与恢复' }).click()
  await page.locator('input[accept=".rmstudy"]').setInputFiles(file)
  await expect(page.getByRole('status')).toContainText('已新增文献导图，关联 1 篇 PDF')
  await page.locator('input[accept=".rmstudy"]').setInputFiles(file)
  await expect(page.getByRole('status')).toContainText('未重复添加')
  const stored = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    return { original: await appDatabase.documents.get('test-map'), documents: await appDatabase.documents.count(),
      papers: await appDatabase.papers.count(), links: await appDatabase.nodePaperRelations.count() }
  })
  expect(stored).toEqual({ original, documents: 4, papers: 1, links: 1 })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByText('文献资料包测试', { exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  const longTopic = page.locator('.me-tpc', { hasText: '计算原理' })
  await expect(longTopic).toHaveClass(/paragraph-topic/)
  const metrics = await longTopic.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight, scroll: el.scrollHeight, font: getComputedStyle(el).fontSize }))
  expect(metrics.width).toBeGreaterThanOrEqual(550)
  expect(metrics.height).toBeGreaterThanOrEqual(metrics.scroll)
  expect(metrics.font).toBe('16px')
  const image = page.locator('.me-tpc.diagram-topic > img')
  await expect(image).toBeVisible()
  expect(await image.evaluate(el => ({ loaded: (el as HTMLImageElement).naturalWidth, width: el.clientWidth }))).toEqual({ loaded: 1200, width: 720 })
  const target = await page.evaluate(async () => {
    const { appDatabase } = await import('/src/db/appDatabase.ts')
    const map = (await appDatabase.documents.toArray()).find(d => d.title === '文献资料包测试')!
    return { documentId: map.id, nodeId: map.root.children.find(n => n.image)!.id, paperNodeId: map.root.children.find(n => n.title === '论文节点')!.id }
  })
  // Focus can supersede a deep-link reveal before its second animation frame.
  // The old reveal must not pan the newly focused image off-screen.
  await page.goto(`/map/${target.documentId}?nodeId=${target.nodeId}`)
  await expect(page.locator('.me-tpc.selected')).toContainText('球面邻域示意图')
  await page.keyboard.press('Control+]')
  await expect(page.locator('.canvas-scale')).toHaveText('100%')
  await expect(page.locator('.me-tpc.diagram-topic > img')).toBeInViewport({ ratio: .9 })
  await page.locator('.focus-breadcrumb button').first().click()
  await page.goto(`/map/${target.documentId}?nodeId=${target.paperNodeId}`)
  await expect(page.locator('.me-tpc.selected')).toContainText('论文节点')
  await page.locator('.me-tpc', { hasText: '论文节点' }).dblclick()
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.embedded-reader .paper-reader-title strong')).toHaveText('Study example')
  await expect(page.locator('.embedded-reader canvas').first()).toBeVisible()
  await expect(page.locator('.embedded-reader .pdf-text-layer').first()).toContainText('ResearchMind first page')
  await page.reload()
  await expect(page.locator('.me-tpc.diagram-topic > img')).toBeVisible()
  await page.locator('.me-tpc', { hasText: '论文节点' }).dblclick()
  await expect(page.locator('.embedded-reader canvas').first()).toBeVisible()
  await expect(page.locator('.embedded-reader .pdf-text-layer').first()).toContainText('ResearchMind first page')
  expect(errors).toEqual([])
})
