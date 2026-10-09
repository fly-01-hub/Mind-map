import { _electron as electron, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkNodeControls } from '../e2e/nodeControlChecks'

test('desktop node controls follow editing and preserve the shared outline', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'researchmind-controls-'))
  const env = { ...process.env, RESEARCHMIND_TEST_PROFILE: profile,
    RESEARCHMIND_TEST_PACKAGE_MAIN: path.resolve('release/win-unpacked/resources/app.asar/electron/main.cjs') }
  delete env.ELECTRON_RUN_AS_NODE
  const app = process.env.RESEARCHMIND_INSTALLED_EXE
    ? await electron.launch({ executablePath: process.env.RESEARCHMIND_INSTALLED_EXE, args: [`--user-data-dir=${profile}`], env })
    : await electron.launch({ args: [path.resolve('e2e-desktop/isolated-main.cjs')], env })
  try { await checkNodeControls(await app.firstWindow(), 'test-results/node-controls-desktop') }
  finally { await app.close() }
})
