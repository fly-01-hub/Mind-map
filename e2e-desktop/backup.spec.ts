import { _electron as electron, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { createTestPdf } from '../e2e/testPdf'

test('desktop imports a literature package and round-trips selected maps with PDFs while preserving old maps', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-backup-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  const launch = () => process.env.RESEARCHMIND_INSTALLED_EXE
    ? electron.launch({ executablePath: process.env.RESEARCHMIND_INSTALLED_EXE, args: [`--user-data-dir=${profile}`], env })
    : electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  let app = await launch()
  try {
    expect(await app.evaluate(({ app: running }) => running.getPath('userData'))).toBe(profile)
    expect(await app.evaluate(({ app: running }) => running.getVersion())).toBe('1.7.12')
    let page = await app.firstWindow()
    await page.getByRole('button', { name: '新建思维导图' }).click()
    await page.getByRole('textbox', { name: '文档名称', exact: true }).fill('桌面原有资料')
    await page.getByRole('textbox', { name: '文档名称', exact: true }).press('Tab')
    await expect(page.locator('.save-status')).toContainText('已保存到本地')
    await page.goto('app://researchmind/library')
    await page.getByRole('button', { name: '备份与恢复' }).click()
    const pdf = createTestPdf(), zip = new JSZip()
    zip.file('pdfs/test.pdf', pdf)
    zip.file('manifest.json', JSON.stringify({ format: 'researchmind-study', version: 1, id: 'desktop-study-test', title: '桌面文献导图',
      root: { id: 'root', title: '桌面文献导图', children: [{ id: 'paper', title: '论文正文', children: [] }] },
      papers: [{ key: 'P1', title: 'Desktop test paper', file: 'pdfs/test.pdf', sha256: createHash('sha256').update(pdf).digest('hex'), pageCount: 2, bytes: pdf.length }],
      links: [{ nodeId: 'paper', paperKey: 'P1' }] }))
    await page.locator('input[accept=".rmstudy"]').setInputFiles({ name: 'study.rmstudy', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) })
    await expect(page.getByRole('status')).toContainText('已新增文献导图，关联 1 篇 PDF')
    await page.getByRole('button', { name: /备份部分导图/ }).click()
    await page.getByRole('checkbox', { name: '选择导图 桌面文献导图', exact: true }).check()
    await page.evaluate(() => Reflect.deleteProperty(window, 'showSaveFilePicker'))
    const exportPath = path.join(profile, 'selected.rmpart')
    await app.evaluate(({ session }, output) => {
      session.defaultSession.once('will-download', (_event, item) => { item.setSavePath(output) })
    }, exportPath)
    await page.getByRole('button', { name: '导出所选导图', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('部分备份已开始下载')
    await expect.poll(async () => (await stat(exportPath).catch(() => undefined))?.size ?? 0).toBeGreaterThan(0)
    const buffer = await readFile(exportPath)
    const backup = JSON.parse(buffer.toString())
    expect(backup.tables.documents).toHaveLength(1)
    expect(backup.tables.paperFiles).toHaveLength(1)
    await page.locator('input[accept=".rmpart,.researchmind"]').setInputFiles({ name: 'selected.rmpart', mimeType: 'application/json', buffer })
    await page.getByRole('button', { name: '新增所选导图', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已新增 1 份导图')
    await page.screenshot({ path: 'test-results/desktop/backup-imported.png' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(page.getByText('桌面原有资料', { exact: true })).toBeVisible()
    await page.getByText('桌面文献导图 (2)', { exact: true }).click()
    await page.getByRole('button', { name: '导图', exact: true }).click()
    await page.locator('.me-tpc', { hasText: '论文正文' }).dblclick()
    await expect(page.locator('.pdf-text-layer').first()).toContainText('ResearchMind first page')
    await app.close()
    app = await launch(); page = await app.firstWindow()
    await expect(page.getByText('桌面原有资料', { exact: true })).toBeVisible()
    await expect(page.getByText('桌面文献导图 (2)', { exact: true })).toBeVisible()
  } finally { await app.close() }
})
