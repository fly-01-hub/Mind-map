import fs from 'node:fs'
import path from 'node:path'
import * as asar from '@electron/asar'
import JSZip from 'jszip'

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const apk = await JSZip.loadAsync(fs.readFileSync(`release/ResearchMind-${version}-android.apk`))
const archive = 'release/win-unpacked/resources/app.asar'
const packagedVersion = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version
const mismatches = []
let count = 0
for (const entry of fs.readdirSync('dist', { recursive: true, withFileTypes: true }).filter((item) => item.isFile())) {
  const file = path.join(entry.parentPath, entry.name)
  const relative = path.relative('dist', file)
  const source = fs.readFileSync(file)
  const android = apk.file(`assets/web/${relative.split(path.sep).join('/')}`)
  if (!android || !source.equals(await android.async('nodebuffer'))) mismatches.push(`apk:${relative}`)
  if (!source.equals(asar.extractFile(archive, path.join('dist', relative)))) mismatches.push(`asar:${relative}`)
  count++
}
console.log(JSON.stringify({ version, packagedVersion, webFiles: count, mismatches }, null, 2))
if (packagedVersion !== version || mismatches.length) process.exitCode = 1
