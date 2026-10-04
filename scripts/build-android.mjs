import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdk) throw new Error('Set ANDROID_HOME for this build process to your Android SDK directory.')
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'
const args = ['-classpath', path.join(project, 'android/gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', '-p', path.join(project, 'android'), 'assembleRelease', '--no-daemon']
if (process.env.RESEARCHMIND_ANDROID_OFFLINE === '1') args.push('--offline')
execFileSync(java, args, { cwd: project, stdio: 'inherit', env: process.env })
const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
const apk = path.join(project, 'release', `ResearchMind-${version}-android.apk`)
await mkdir(path.join(project, 'release'), { recursive: true })
await cp(path.join(project, 'android/app/build/outputs/apk/release/app-release.apk'), apk)
console.log(`Android APK: ${apk}`)
