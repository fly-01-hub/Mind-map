import { expect, type Locator, type Page } from '@playwright/test'

async function followsNode(page: Page, target: Locator) {
  await expect(page.getByRole('button', { name: '添加子主题', exact: true })).toBeVisible()
  await expect.poll(async () => {
    const node = await target.boundingBox()
    const controls = await page.locator('.node-quick-actions').boundingBox()
    if (!node || !controls) return false
    return Math.abs(controls.x - (node.x + node.width + 7)) < 2
      && Math.abs(controls.y + controls.height / 2 - (node.y + node.height / 2)) < 2
  }).toBe(true)
}

// Same real UI scenario in browser, production Android resources and Electron.
// Call only in isolated test profiles; never in the user's document library.
export async function checkNodeControls(page: Page, screenshots: string) {
  await page.getByRole('button', { name: '新建思维导图' }).first().click()
  await page.getByLabel('文档名称', { exact: true }).fill('节点按钮位置调试')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc').first().dblclick()
  const editor = page.locator('#input-box[contenteditable]')
  await editor.fill('小说')
  await page.locator('.mindmap-stage').click({ position: { x: 20, y: 30 } })
  await page.locator('.me-tpc', { hasText: '小说' }).click()
  await page.getByRole('button', { name: '添加子主题', exact: true }).click()
  await editor.fill('以主角')
  await expect(page.locator('.me-tpc.selected')).toHaveCount(1)
  await followsNode(page, editor)
  const shortX = (await page.locator('.node-quick-actions').boundingBox())!.x
  await editor.press('End')
  await page.keyboard.insertText('的日记开篇，但是出现了一个秘密')
  await followsNode(page, editor)
  expect((await page.locator('.node-quick-actions').boundingBox())!.x).toBeGreaterThan(shortX + 50)
  await expect(editor).toBeFocused()
  await page.screenshot({ path: `${screenshots}-typing.png` })

  await editor.fill('以主角')
  await followsNode(page, editor)
  expect((await page.locator('.node-quick-actions').boundingBox())!.x).toBeLessThan(shortX + 2)
  await editor.fill('以主角的日记开篇\n第二行记录一个秘密')
  await followsNode(page, editor)
  await page.screenshot({ path: `${screenshots}-multiline.png` })
  // Exercise composing input without rewriting the editor or moving its caret.
  await editor.dispatchEvent('compositionstart')
  await page.keyboard.insertText('，接着继续书写')
  await followsNode(page, editor)
  await editor.dispatchEvent('compositionend')
  await expect(editor).toBeFocused()
  let parentText = await editor.innerText()

  // Clicking the moving + must commit the pending parent text before insertion.
  await page.getByRole('button', { name: '添加子主题', exact: true }).click()
  await editor.fill('后续情节')
  await page.locator('.mindmap-stage').click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.me-tpc')).toHaveCount(3)
  const parent = page.locator('.me-tpc', { hasText: '以主角的日记开篇' })
  await parent.click()
  await followsNode(page, parent)
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await followsNode(page, parent)
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  await followsNode(page, parent)
  const beforePan = (await page.locator('.node-quick-actions').boundingBox())!.x
  await page.mouse.move(200, 300)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(260, 340, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
  await followsNode(page, parent)
  expect((await page.locator('.node-quick-actions').boundingBox())!.x).toBeGreaterThan(beforePan + 40)

  await parent.dblclick()
  // Preserve the app's existing Escape behavior: finish / save inline editing.
  await editor.fill(`${parentText}（退出编辑）`)
  parentText = await editor.innerText()
  await followsNode(page, editor)
  await editor.press('Escape')
  await followsNode(page, parent)
  await expect(parent.locator(':scope > .text')).toHaveText(parentText, { useInnerText: true })
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true }).filter({ hasText: '以主角的日记开篇' })).toHaveText(parentText, { useInnerText: true })
  await expect(page.locator('.outline-topic-input', { hasText: '后续情节' })).toBeVisible()
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.reload()
  await expect(page.locator('.outline-topic-input', { hasText: '以主角的日记开篇' })).toHaveText(parentText, { useInnerText: true })
}
