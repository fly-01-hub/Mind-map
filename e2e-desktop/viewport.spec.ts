import { _electron as electron, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkViewportStability } from '../e2e/viewportChecks'

test('desktop editing stays in place and minimally follows overflowing content', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-viewport-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  const app = process.env.RESEARCHMIND_INSTALLED_EXE
    ? await electron.launch({ executablePath: process.env.RESEARCHMIND_INSTALLED_EXE, args: [`--user-data-dir=${profile}`], env })
    : await electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  try { await checkViewportStability(await app.firstWindow(), 'test-results/viewport-desktop') }
  finally { await app.close() }
})
