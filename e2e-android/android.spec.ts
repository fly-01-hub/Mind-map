import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createTestPdf } from '../e2e/testPdf'
import { checkNodeControls } from '../e2e/nodeControlChecks'
import { checkTextColors } from '../e2e/textColorChecks'
import { checkNodeOrder } from '../e2e/nodeOrderChecks'
import { checkViewportStability } from '../e2e/viewportChecks'

const origin = 'https://appassets.androidplatform.net'
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

async function androidPage(page: Page, production = false) {
  // Isolated synthetic native endpoint. This does NOT claim to test Android's system picker.
  await page.addInitScript(() => {
    const state = { chunks: [] as string[], name: '', size: 0, finished: false, cancel: false, prints: 0, actions: [] as string[] }
    Object.assign(window, { androidTest: state, ResearchMindNative: {
      onmessage: undefined as undefined | ((event: { data: string }) => void),
      postMessage(data: string) {
        const message = JSON.parse(data)
        state.actions.push(message.action)
        if (message.action === 'begin') { state.chunks = []; state.name = message.name; state.size = message.size; state.finished = false }
        if (message.action === 'chunk') state.chunks.push(message.data)
        if (message.action === 'finish') state.finished = !state.cancel
        if (message.action === 'print') state.prints++
        const cancelled = message.action === 'finish' && state.cancel
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: message.id, ok: !cancelled, cancelled }) }))
      },
    } })
  })
  await page.route(`${origin}/**`, async (route) => {
    const requestPath = decodeURIComponent(new URL(route.request().url()).pathname)
    if (requestPath === '/@vite/client') return route.fulfill({ contentType: 'application/javascript', body: `
      export const injectQuery = (url) => url;
      export const createHotContext = () => ({ data: {}, accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {} });
      const styles = new Map();
      export function updateStyle(id, text) { let style = styles.get(id); if (!style) { style = document.createElement('style'); styles.set(id, style); document.head.append(style); } style.textContent = text; }
      export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
    ` })
    if (!production) {
      const response = await route.fetch({ url: `http://127.0.0.1:5185${requestPath}${new URL(route.request().url()).search}` })
      return route.fulfill({ response })
    }
    const root = path.resolve('dist')
    const file = path.resolve(root, `.${path.extname(requestPath) ? requestPath : '/index.html'}`)
    if (!file.startsWith(`${root}${path.sep}`)) return route.abort()
    const mime: Record<string, string> = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json' }
    try { await route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] || 'application/octet-stream' }) }
    catch { await route.fulfill({ status: 404, body: '' }) }
  })
  await page.goto(`${origin}/library`)
  await expect(page.getByRole('heading', { name: '全部文档' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'android')
}

test('Android production node controls track the live editor without hiding text', async ({ page }) => {
  await androidPage(page, true)
  await checkNodeControls(page, 'test-results/node-controls-android')
})

test('Android production editing only pans for overflowing content', async ({ page }) => {
  await androidPage(page, true)
  await checkViewportStability(page, 'test-results/viewport-android')
})

test('Android production selected text colors persist across views without affecting links', async ({ page }) => {
  await androidPage(page, true)
  await checkTextColors(page, 'test-results/text-colors-android', true)
})

test('Android production touch menus reorder branches and preserve outline persistence', async ({ page }) => {
  await androidPage(page, true)
  await checkNodeOrder(page, 'test-results/node-order-android', true)
})

test('native export preserves all bytes in bounded chunks and handles cancellation', async ({ page }) => {
  await androidPage(page)
  const result = await page.evaluate(async () => {
    const { saveAndroidFile, isAndroidApp, printAndroidPage } = await import('/src/services/platform/androidFiles.ts')
    const state = (window as unknown as { androidTest: { chunks: string[]; cancel: boolean; actions: string[]; name: string; size: number; prints: number } }).androidTest
    const data = Uint8Array.from({ length: 410_009 }, (_, index) => index % 256)
    await saveAndroidFile(new Blob([data], { type: 'application/octet-stream' }), '分块附件.bin')
    const decoded = state.chunks.map((value) => atob(value)).join('')
    const success = { android: isAndroidApp(), exact: decoded.length === data.length && Array.from(decoded).every((value, index) => value.charCodeAt(0) === data[index]), chunks: state.chunks.length, max: Math.max(...state.chunks.map((value) => value.length)), name: state.name, size: state.size }
    state.cancel = true
    let cancelled = false
    try { await saveAndroidFile(new Blob(['取消']), '取消.txt') } catch (error) { cancelled = error instanceof DOMException && error.name === 'AbortError' }
    state.cancel = false
    await saveAndroidFile(new Blob([]), '空文件.txt')
    await printAndroidPage()
    return { ...success, cancelled, abort: state.actions.includes('abort'), prints: state.prints }
  })
  expect(result).toEqual({ android: true, exact: true, chunks: 3, max: 262144, name: '分块附件.bin', size: 410009, cancelled: true, abort: true, prints: 1 })
})

test('touch-created map links open missing documents and return through backlinks', async ({ page }) => {
  await androidPage(page, true)
  await page.getByRole('button', { name: '新建思维导图' }).first().tap()
  await page.getByLabel('文档名称', { exact: true }).fill('安卓平板触屏调试')
  await page.getByRole('button', { name: '大纲', exact: true }).tap()
  await page.getByRole('button', { name: '输入第一个主题', exact: true }).tap()
  await page.getByRole('textbox', { name: '主题内容', exact: true }).fill('触屏链接 [[平板目标]]')
  await page.getByRole('button', { name: '导图', exact: true }).tap()
  const link = page.locator('.wiki-link[data-wiki-name="平板目标"]').first()
  await expect(link).toBeVisible()
  await page.screenshot({ path: 'test-results/android-map.png' })
  const linkBox = (await link.boundingBox())!
  await page.touchscreen.tap(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2)
  await page.touchscreen.tap(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2)
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('平板目标')
  await page.getByRole('region', { name: '文档反向引用' }).getByRole('button', { name: /安卓平板触屏调试/ }).tap()
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('安卓平板触屏调试')
  await page.getByRole('button', { name: '大纲', exact: true }).tap()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true })).toHaveText('触屏链接 [[平板目标]]')
  await page.screenshot({ path: 'test-results/android-outline.png' })
  await page.reload()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true })).toHaveText('触屏链接 [[平板目标]]')
  const point = await page.getByRole('textbox', { name: '主题内容', exact: true }).evaluate((element) => {
    const node = element.firstChild!
    const text = node.textContent!
    const start = text.indexOf('平板目标')
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 4)
    const rect = range.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
  await page.touchscreen.tap(point.x, point.y); await page.touchscreen.tap(point.x, point.y)
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('平板目标')
})

test('Android backup saves, restores folders and documents, and refreshes the UI', async ({ page }) => {
  await androidPage(page, true)
  await page.getByRole('button', { name: '新建文件夹' }).tap()
  await page.getByRole('textbox', { name: '文件夹名称' }).fill('平板备份文件夹')
  await page.getByRole('button', { name: '创建文件夹' }).tap()
  await page.getByRole('button', { name: '新建思维导图' }).first().tap()
  await page.getByLabel('文档名称', { exact: true }).fill('备份内容 [[另一文档]]')
  await page.getByRole('button', { name: '返回知识库', exact: true }).tap()
  await page.getByRole('button', { name: '备份与恢复' }).tap()
  await page.getByRole('button', { name: /创建完整备份/ }).tap()
  await expect(page.getByRole('status')).toContainText('备份已保存')
  const backup = await page.evaluate(() => {
    const state = (window as unknown as { androidTest: { chunks: string[] } }).androidTest
    const binary = state.chunks.map((value) => atob(value)).join('')
    return Array.from(binary, (value) => value.charCodeAt(0))
  })
  const payload = JSON.parse(Buffer.from(backup).toString('utf8'))
  expect(payload.tables.folders.some((folder: { name: string }) => folder.name === '平板备份文件夹')).toBe(true)
  expect(payload.tables.documents.some((document: { title: string }) => document.title === '备份内容 [[另一文档]]')).toBe(true)
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zhijian-knowledge-db'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['documents', 'folders'], 'readwrite')
        transaction.objectStore('documents').clear(); transaction.objectStore('folders').clear()
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
      })
    } finally { db.close() }
  })
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('input[type=file][accept*=researchmind]').setInputFiles({ name: '跨设备.researchmind', mimeType: 'application/octet-stream', buffer: Buffer.from(backup) })
  await expect(page.getByText('备份内容 [[另一文档]]', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '平板备份文件夹', exact: true })).toBeVisible()
})

test('packaged production UI fits tablet portrait, exports backup and does not register a service worker', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await androidPage(page, true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/android-library-portrait.png' })
  await page.getByRole('button', { name: '备份与恢复' }).tap()
  await page.getByRole('button', { name: /创建完整备份/ }).tap()
  await expect(page.getByRole('status')).toContainText('备份已保存')
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
  expect(errors).toEqual([])
})

test('packaged PDF worker loads offline, renders, and restores the reading page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await androidPage(page, true)
  await page.getByRole('button', { name: '新建思维导图' }).first().tap()
  await page.getByRole('button', { name: '导图', exact: true }).tap()
  await page.locator('.me-tpc').first().tap()
  await page.getByRole('button', { name: '节点详情', exact: true }).tap()
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({ name: '安卓离线 PDF.pdf', mimeType: 'application/pdf', buffer: createTestPdf() })
  await page.getByText('安卓离线 PDF', { exact: true }).tap()
  await expect(page.locator('.pdf-page-shell')).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
  await expect(page.locator('.textLayer span', { hasText: 'ResearchMind first page' })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).tap()
  await expect(page.getByLabel('当前页码')).toHaveValue('2')
  await expect(page.locator('.textLayer span', { hasText: 'Second-page target phrase' })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zhijian-knowledge-db'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('paperReadingStates').objectStore('paperReadingStates').getAll()
        request.onsuccess = () => resolve(request.result[0]?.pageNumber); request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })).toBe(2)
  await page.screenshot({ path: 'test-results/android-pdf.png' })
  expect(await page.getByRole('button', { name: '矩形高亮', exact: true }).evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap')
  await page.reload()
  await expect(page.getByLabel('当前页码')).toHaveValue('2')
  expect(errors).toEqual([])
})
