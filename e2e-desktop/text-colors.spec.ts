import { _electron as electron, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkContextMenu, checkTextColors } from '../e2e/textColorChecks'

test('desktop selected text colors and compact menu preserve native editing', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-colors-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  const app = process.env.RESEARCHMIND_INSTALLED_EXE
    ? await electron.launch({ executablePath: process.env.RESEARCHMIND_INSTALLED_EXE, args: [`--user-data-dir=${profile}`], env })
    : await electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1440, height: 900 })
    await checkTextColors(page, 'test-results/text-colors-desktop')
    await page.getByRole('button', { name: '返回知识库' }).click()
    await checkContextMenu(page, 'test-results/text-colors-desktop')
  } finally { await app.close() }
})
