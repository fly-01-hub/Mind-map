import fs from 'node:fs'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

const output = path.resolve('release/promotion')
const assets = path.join(output, 'public/assets')
fs.mkdirSync(assets, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const initial = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const setup = await initial.newPage()
await setup.goto('http://127.0.0.1:4173/library')
await setup.getByRole('button', { name: '新建思维导图', exact: true }).click()
await setup.getByLabel('文档名称', { exact: true }).fill('文献阅读与笔记')
await setup.getByLabel('文档名称', { exact: true }).press('Enter')
await setup.getByRole('button', { name: '导图', exact: true }).click()
await setup.locator('.me-tpc').first().dblclick()
await setup.locator('#input-box[contenteditable]').fill('文献阅读与笔记')
const commit = page => page.locator('.mindmap-stage').click({ position: { x: 20, y: 90 } })
await commit(setup)
async function child(parent, text) {
  await setup.locator('.me-tpc', { hasText: parent }).first().click()
  await setup.getByRole('button', { name: '添加子主题', exact: true }).click()
  await setup.locator('#input-box[contenteditable]').fill(text)
  await commit(setup)
}
await child('文献阅读与笔记', '研究背景')
await child('研究背景', '明确阅读目标')
await child('研究背景', '梳理已有资料')
await child('文献阅读与笔记', '文献阅读')
await child('文献阅读与笔记', '方法与问题')
await child('方法与问题', '记录关键思路')
await child('方法与问题', '整理后续疑问')
await expect(setup.locator('.save-status')).toContainText('已保存到本地')
const url = setup.url()
const storageState = await initial.storageState({ indexedDB: true })
await initial.close()

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }, storageState,
  recordVideo: { dir: path.join(output, 'raw-video'), size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(url)
  await expect(page.locator('.me-tpc', { hasText: '文献阅读' }).first()).toBeVisible()
  await page.getByRole('button', { name: '适应画布', exact: true }).first().click()
  await commit(page)
  await page.screenshot({ path: path.join(assets, 'mindmap.png') })
  const started = Date.now()
  async function caption(text) {
    await page.evaluate(text => {
      let banner = document.getElementById('public-demo-caption')
      if (!banner) {
        banner = document.createElement('div'); banner.id = 'public-demo-caption'
        banner.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:99999;pointer-events:none;background:#233e31;color:white;padding:12px 26px;border-radius:12px;font:600 18px/1.5 "Microsoft YaHei",sans-serif;box-shadow:0 5px 20px #0002;white-space:nowrap'
        document.body.append(banner)
      }
      banner.textContent = text
    }, text)
  }
  await caption('ResearchMind 枝间 · 免费 PDF 阅读与思维导图')
  await page.waitForTimeout(2600)
  await caption('① 将 PDF 拖到节点，文献自动生成子主题')
  const target = page.locator('.me-tpc', { hasText: /^文献阅读$/ }).first()
  const bounds = await target.boundingBox()
  await page.evaluate(() => {
    const chip = document.createElement('div'); chip.id = 'public-demo-file'
    chip.textContent = '📄 文献阅读示例.pdf'
    chip.style.cssText = 'position:fixed;left:100px;top:220px;z-index:99999;padding:14px 20px;border:1px solid #88a494;background:#f4faf5;box-shadow:0 6px 20px #0002;border-radius:10px;font:16px "Microsoft YaHei";pointer-events:none;transition:left 1.2s ease,top 1.2s ease'
    document.body.append(chip)
  })
  await page.waitForTimeout(700)
  await page.evaluate(({ x, y }) => {
    const chip = document.getElementById('public-demo-file'); chip.style.left = `${x}px`; chip.style.top = `${y}px`
  }, { x: bounds.x, y: bounds.y })
  await page.mouse.move(bounds.x + 30, bounds.y + 15, { steps: 12 })
  await page.waitForTimeout(1500)
  await target.evaluate((element, bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], '文献阅读示例.pdf', { type: 'application/pdf' }))
    for (const type of ['dragenter', 'dragover', 'drop']) element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
    document.getElementById('public-demo-file')?.remove()
  }, Array.from(fs.readFileSync(path.join(output, 'reading-demo.pdf'))))
  const reader = page.locator('.embedded-reader')
  await expect(reader.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false', { timeout: 15000 })
  await reader.getByRole('button', { name: '返回思维导图', exact: true }).click()
  const paper = page.locator('.me-tpc', { hasText: '文献阅读示例' }).first()
  await paper.click()
  await expect(reader).toHaveCount(0)
  await caption('② 单击选中 · 双击文献节点打开分栏阅读')
  await page.waitForTimeout(1800)
  await paper.dblclick({ delay: 100 })
  await expect(reader.locator('.pdf-page-shell[data-current-page="true"]')).toHaveAttribute('aria-busy', 'false')
  await reader.getByRole('button', { name: '适应阅读宽度', exact: true }).click()
  await page.getByRole('button', { name: '适应画布', exact: true }).first().click()
  await page.waitForTimeout(2800)
  await caption('③ 选中关键句并高亮，自动生成关联的导图节点')
  const quote = page.locator('.textLayer span', { hasText: '将关键观点整理成节点，建立清晰的知识结构。' }).first()
  await expect(quote).toBeVisible()
  await quote.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '高亮', exact: true }).click()
  await expect(page.locator('.me-tpc', { hasText: '将关键观点整理成节点' }).first()).toBeVisible()
  await page.getByRole('button', { name: '适应画布', exact: true }).first().click()
  await page.waitForTimeout(2600)
  await page.evaluate(() => document.getElementById('public-demo-caption')?.remove())
  await page.screenshot({ path: path.join(assets, 'pdf-reading.png') })
  await caption('④ 阅读与整理在同一页完成 · 资料保存在当前设备')
  await page.waitForTimeout(2500)
  await caption('免费体验：fly-01-hub.github.io/Mind-map-download/')
  const remaining = 30000 - (Date.now() - started)
  if (remaining > 0) await page.waitForTimeout(remaining)
  if (errors.length) throw new Error(errors.join('; '))
  fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify({ demoUrl: url, durationMs: Date.now() - started, assets: ['mindmap.png', 'pdf-reading.png'], synthetic: true, errors }, null, 2))
  const video = page.video()
  await context.close()
  await video.saveAs(path.join(output, 'demo-raw.webm'))
  console.log('Demo captured from the production app using an isolated, synthetic library.')
} catch (error) {
  await page.screenshot({ path: path.join(output, 'capture-failure.png') }).catch(() => {})
  await context.close()
  throw error
} finally { await browser.close() }
