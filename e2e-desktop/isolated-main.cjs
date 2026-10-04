// Test-only entry point: set an isolated profile BEFORE loading the real desktop shell.
const { app } = require('electron')
const path = require('node:path')
const profile = process.env.RESEARCHMIND_TEST_PROFILE
if (!profile || !path.isAbsolute(profile)) throw new Error('An absolute isolated test profile is required')
app.setPath('userData', profile)
require(process.env.RESEARCHMIND_TEST_PACKAGE_MAIN || '../electron/main.cjs')
