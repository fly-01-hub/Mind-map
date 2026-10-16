import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { expect, test } from './fixtures'
import { createTestPdf } from './testPdf'

test('adds a study package, preserves existing maps, opens its PDF, and skips duplicate imports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const pdf = createTestPdf()
  const node = (id: string, title: string, children: unknown[] = []) => ({ id, title, children })
  const zip = new JSZip()
  zip.file('pdfs/example.pdf', pdf)
  zip.file('manifest.json', JSON.stringify({
    format: 'researchmind-study', version: 1, id: 'browser-study-test', title: '文献资料包测试',
    root: node('root', '文献资料包测试', [node('paper', '论文节点', [node('summary', '摘要：测试内容')])]),
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
  await page.locator('.me-tpc', { hasText: '论文节点' }).dblclick()
  await expect(page.locator('.embedded-reader')).toBeVisible()
  await expect(page.locator('.embedded-reader .paper-reader-title strong')).toHaveText('Study example')
  await expect(page.locator('.embedded-reader canvas').first()).toBeVisible()
  await expect(page.locator('.embedded-reader .pdf-text-layer').first()).toContainText('ResearchMind first page')
  await page.reload()
  await page.locator('.me-tpc', { hasText: '论文节点' }).dblclick()
  await expect(page.locator('.embedded-reader canvas').first()).toBeVisible()
  await expect(page.locator('.embedded-reader .pdf-text-layer').first()).toContainText('ResearchMind first page')
  expect(errors).toEqual([])
})
