import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const built = path.join(project, 'dist')
await readFile(path.join(built, 'index.html'))
const target = path.join(project, 'android/app/src/main/assets/web')
if (path.relative(project, target).split(path.sep).join('/') !== 'android/app/src/main/assets/web') throw new Error('Unexpected generated assets directory')
// This exact ignored directory contains generated assets only. Remove stale bundles from older builds.
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
// Copy build outputs only, never Electron's user profile or a personal backup.
await cp(built, target, { recursive: true })
console.log('Android bundled web assets prepared.')
