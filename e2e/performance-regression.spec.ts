import { test, expect } from './fixtures'

test('folds nested branches atomically and restores the complete tree', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/map/test-map')
  await page.getByRole('button', { name: '导图', exact: true }).click()
  await expect(page.locator('.me-tpc')).toHaveCount(11)
  const toggle = async (collapsed: boolean) => page.evaluate(async (value) => {
    const { useDocumentStore } = await import('/src/stores/documentStore.ts')
    const store = useDocumentStore.getState()
    const document = store.documents.find((item) => item.id === 'test-map')!
    const branches: string[] = []
    const collect = (node: typeof document.root) => {
      if (node.id !== document.root.id && node.children.length) branches.push(node.id)
      node.children.forEach(collect)
    }
    collect(document.root)
    store.updateMany(branches, { collapsed: value })
  }, collapsed)
  await toggle(true)
  await expect(page.locator('.me-tpc')).toHaveCount(4)
  await toggle(false)
  await expect(page.locator('.me-tpc')).toHaveCount(11)
  expect(errors).toEqual([])
})
