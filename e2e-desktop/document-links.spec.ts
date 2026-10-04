import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('built desktop shell creates references in an isolated profile and restores them after reopening', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-links-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  // Opt-in installation acceptance still uses a separate temporary profile.
  const installedExe = process.env.RESEARCHMIND_INSTALLED_EXE
  const launch = () => installedExe
    ? electron.launch({ executablePath: installedExe, args: [`--user-data-dir=${profile}`], env })
    : electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  let app = await launch()
  try {
    expect(await app.evaluate(({ app: running }) => running.getPath('userData'))).toBe(profile)
    let page = await app.firstWindow()
    await page.getByRole('button', { name: '新建思维导图' }).click()
    await page.getByLabel('文档名称', { exact: true }).fill('桌面双向链接调试')
    await page.getByLabel('文档名称', { exact: true }).press('Tab')
    await page.getByRole('button', { name: '导图', exact: true }).click()
    await page.locator('.me-tpc').first().click()
    await page.keyboard.press('Tab')
    const editor = page.locator('#input-box[contenteditable]')
    await editor.fill('桌面测试 [[桌面目标文档]]')
    await page.locator('.mindmap-stage').click({ position: { x: 20, y: 30 } })
    await expect(page.locator('.me-tpc .wiki-link')).toBeVisible()
    await page.screenshot({ path: 'test-results/desktop/map-source.png' })
    await page.locator('.me-tpc .wiki-link').dblclick()
    await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('桌面目标文档')
    await expect(page.getByRole('region', { name: '文档反向引用' })).toContainText('桌面双向链接调试')
    await page.screenshot({ path: 'test-results/desktop/map-target.png' })
    await page.getByRole('region', { name: '文档反向引用' }).getByRole('button', { name: /桌面双向链接调试/ }).click()
    await expect(page.locator('.me-tpc.selected')).toContainText('桌面测试')
    await page.getByRole('button', { name: '大纲', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '主题内容', exact: true })).toHaveText('桌面测试 [[桌面目标文档]]')
    await page.screenshot({ path: 'test-results/desktop/outline-source.png' })
    await expect(page.locator('.save-status')).toContainText('已保存到本地')
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    await page.getByText('桌面目标文档', { exact: true }).click()
    await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('桌面目标文档')
    await expect(page.locator('.outline-document .document-backlinks')).toContainText('桌面双向链接调试')
    await page.screenshot({ path: 'test-results/desktop/reopened-target.png' })
  } finally { await app.close() }
})
