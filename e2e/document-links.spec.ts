import { expect, test, type Locator, type Page } from '@playwright/test'

async function newDocument(page: Page, title: string) {
  if (await page.getByRole('button', { name: '返回知识库', exact: true }).count()) await page.getByRole('button', { name: '返回知识库', exact: true }).click()
  else await page.goto('/library')
  await page.getByRole('button', { name: '新建思维导图' }).click()
  await page.getByLabel('文档名称', { exact: true }).fill(title)
  await page.getByLabel('文档名称', { exact: true }).press('Tab')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue(title)
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  return page.url()
}
async function addOutlineNode(page: Page, text: string) {
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await page.getByRole('button', { name: '输入第一个主题', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '主题内容', exact: true }).first()
  await editor.pressSequentially(text)
  return editor
}
async function doubleClickTextLink(page: Page, editor: Locator, name: string) {
  const point = await editor.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let current: Node | null
    while ((current = walker.nextNode())) {
      const text = current.textContent ?? ''
      const index = text.indexOf(wanted)
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(current, index); range.setEnd(current, index + wanted.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    throw new Error('Link text is not visible')
  }, name)
  await page.mouse.dblclick(point.x, point.y)
}

test('creates from a map link, returns to the exact source, and opens the same document from outline', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const sourceUrl = await newDocument(page, '链接调试 · 研究笔记')
  const editor = await addOutlineNode(page, '前文 [[机器视觉]] 后文 [[实验设计]]')
  await expect(editor).toHaveText('前文 [[机器视觉]] 后文 [[实验设计]]')
  expect(await editor.evaluate(() => CSS.highlights.get('document-links')?.size)).toBe(2)
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc .wiki-link')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/document-links-map.png' })
  await page.locator('.me-tpc .wiki-link[data-wiki-name="机器视觉"]').dblclick()
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('机器视觉')
  const targetUrl = page.url()
  await expect(page.locator('.me-tpc')).toHaveCount(1)
  const backlinks = page.getByRole('region', { name: '文档反向引用' })
  await expect(backlinks).toContainText('链接调试 · 研究笔记')
  await backlinks.getByRole('button', { name: /链接调试 · 研究笔记/ }).click()
  await expect(page).toHaveURL(new RegExp(sourceUrl.split('/').at(-1)!))
  await expect(page.locator('.me-tpc.selected')).toContainText('前文')
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  const outline = page.getByRole('textbox', { name: '主题内容', exact: true }).first()
  await doubleClickTextLink(page, outline, '机器视觉')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('机器视觉')
  expect(page.url()).toBe(targetUrl)
  await page.reload()
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('机器视觉')
  await expect(page.locator('.outline-document .document-backlinks')).toContainText('链接调试 · 研究笔记')
  await page.screenshot({ path: 'test-results/document-links-outline.png' })
  expect(errors).toEqual([])
})

test('highlights during map typing and saves before opening an uncreated link', async ({ page }) => {
  const sourceUrl = await newDocument(page, '输入时跳转')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.locator('.me-tpc').first().click()
  await page.keyboard.press('Tab')
  const editor = page.locator('#input-box[contenteditable]')
  await editor.press('Control+A')
  await editor.pressSequentially('未提交的 [[新目标]] 内容')
  expect(await editor.evaluate(() => CSS.highlights.get('document-links')?.size)).toBeGreaterThan(0)
  await doubleClickTextLink(page, editor, '新目标')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('新目标')
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.goto(sourceUrl)
  await expect(page.locator('.me-tpc', { hasText: '未提交的 [[新目标]] 内容' })).toBeVisible()
  await page.locator('.me-tpc', { hasText: '未提交的' }).dblclick({ position: { x: 5, y: 10 } })
  await expect(editor).toBeVisible()
  await editor.press('Control+A')
  await editor.pressSequentially('正常编辑和删除')
  await editor.press('Backspace')
  await expect(editor).toHaveText('正常编辑和删')
  await page.locator('.mindmap-stage').click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.me-tpc')).toHaveCount(2)
})

test('rename updates references in both views and prevents duplicate names', async ({ page }) => {
  const sourceUrl = await newDocument(page, '引用来源')
  await addOutlineNode(page, '链接 [[原目标]]')
  await page.getByLabel('文档名称', { exact: true }).click()
  const targetUrl = await newDocument(page, '原目标')
  await page.getByLabel('文档名称', { exact: true }).fill('新目标')
  await page.getByLabel('文档名称', { exact: true }).press('Tab')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('新目标')
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.goto(sourceUrl)
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true })).toHaveText('链接 [[新目标]]')
  await page.getByLabel('文档名称', { exact: true }).fill('新目标')
  await page.getByLabel('文档名称', { exact: true }).press('Tab')
  await expect(page.getByRole('alert')).toContainText('已存在')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('引用来源')
  await page.getByRole('button', { name: '关闭名称提示' }).click()
  await doubleClickTextLink(page, page.getByRole('textbox', { name: '主题内容', exact: true }), '新目标')
  await expect(page).toHaveURL(targetUrl)
})

test('literal code is not linked, rich styles survive, and unsafe content cannot execute', async ({ page }) => {
  await page.goto('/library')
  const result = await page.evaluate(async () => {
    const { decorateWikiLinks, replaceRichWikiLinks } = await import('/src/utils/wikiLinks.ts')
    const { plainTextFromRichText, sanitizeRichText } = await import('/src/utils/richText.ts')
    const html = decorateWikiLinks('前 [[研<strong>究</strong> &amp; &lt;img&gt;]] 后 <code>[[代码]]</code><script>alert(1)</script>', [])
    const container = document.createElement('div')
    container.innerHTML = html
    return {
      strong: container.querySelector('strong .wiki-link')?.textContent,
      unsafe: !!container.querySelector('script, img'), code: !!container.querySelector('code .wiki-link'),
      text: plainTextFromRichText(html), persisted: sanitizeRichText(html),
      renamed: plainTextFromRichText(replaceRichWikiLinks(html, '研究 & <img>', '新文档')),
    }
  })
  expect(result).toMatchObject({ strong: '究', unsafe: false, code: false, text: '前 [[研究 & <img>]] 后 [[代码]]', renamed: '前 [[新文档]] 后 [[代码]]' })
  expect(result.persisted).not.toContain('wiki-link')
})

test('read-only can follow existing links but cannot create a missing document', async ({ page }) => {
  await newDocument(page, '只读链接')
  await addOutlineNode(page, '[[不存在的文档]]')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '只读浏览' }).click()
  await page.locator('.wiki-link').dblclick()
  await expect(page.getByRole('alert')).toContainText('退出只读')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('只读链接')
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '主题内容', exact: true })).toHaveAttribute('contenteditable', 'false')
})

test('note references work in Markdown preview and inline outline notes', async ({ page }) => {
  const sourceUrl = await newDocument(page, '笔记链接来源')
  await addOutlineNode(page, '保留标题')
  await page.getByLabel('文档名称', { exact: true }).click()
  await page.getByRole('button', { name: '节点详情', exact: true }).click()
  await page.getByLabel('Markdown 笔记', { exact: true }).fill('参考 [[笔记目标]]，`[[代码样例]]` 不作为链接。')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('.markdown-preview .wiki-link')).toHaveCount(1)
  await page.locator('.markdown-preview .wiki-link').dblclick()
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('笔记目标')
  const targetUrl = page.url()
  await expect(page.locator('.outline-document .document-backlinks')).toContainText('笔记 · 保留标题')
  await page.goto(sourceUrl)
  await page.locator('.outline-description .wiki-link').dblclick()
  await expect(page).toHaveURL(targetUrl)
})

test('removing a reference updates backlinks and undo restores the reference', async ({ page }) => {
  const sourceUrl = await newDocument(page, '可撤销的引用')
  const editor = await addOutlineNode(page, '[[撤销目标]]')
  await doubleClickTextLink(page, editor, '撤销目标')
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('撤销目标')
  await page.getByRole('region', { name: '文档反向引用' }).first().getByRole('button', { name: /可撤销的引用/ }).click()
  await expect(page).toHaveURL(new RegExp(sourceUrl.split('/').at(-1)!))
  const input = page.getByRole('textbox', { name: '主题内容', exact: true })
  await input.fill('已取消引用')
  await page.getByLabel('文档名称', { exact: true }).click()
  await expect(page.locator('.save-status')).toContainText('已保存到本地')
  await page.getByRole('button', { name: '返回知识库', exact: true }).click()
  await page.getByText('撤销目标', { exact: true }).click()
  await expect(page.locator('.outline-document .document-backlinks')).toContainText('还没有节点引用')
  // Navigate within the app so the in-memory undo stack remains available.
  await page.getByRole('button', { name: '返回知识库', exact: true }).click()
  await page.getByText('可撤销的引用', { exact: true }).click()
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('button', { name: '大纲', exact: true }).click()
  await expect(input).toHaveText('[[撤销目标]]')
  await doubleClickTextLink(page, input, '撤销目标')
  await expect(page.locator('.outline-document .document-backlinks')).toContainText('可撤销的引用')
})

test('legacy duplicates require choosing a document and do not create a third copy', async ({ page }) => {
  await page.goto('/library')
  await expect.poll(() => page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    return useDocumentStore.getState().hydrated
  })).toBe(true)
  await page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const store = useDocumentStore.getState()
    const first = store.createDocument('旧同名')
    const second = store.createDocument('第二份')
    useDocumentStore.setState({ documents: useDocumentStore.getState().documents.map((item) => item.id === second.id ? { ...item, title: first.title, root: { ...item.root, title: first.title } } : item) })
  })
  await page.getByRole('button', { name: '新建思维导图' }).click()
  const editor = await addOutlineNode(page, '[[旧同名]]')
  await doubleClickTextLink(page, editor, '旧同名')
  const dialog = page.getByRole('dialog', { name: '选择同名文档' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator(':scope > button')).toHaveCount(2)
  await dialog.locator(':scope > button').first().click()
  await expect(page.getByLabel('文档名称', { exact: true })).toHaveValue('旧同名')
})
