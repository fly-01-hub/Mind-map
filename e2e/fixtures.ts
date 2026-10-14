import { test as base, expect } from '@playwright/test'
import { testDocuments, testFolders } from '../tests/fixtures/documents'

// Only regression tests seed synthetic records, in Playwright's temporary profile.
export const test = base.extend({
  page: async ({ page }, runFixture) => {
    await page.goto('/library')
    await expect(page.getByRole('button', { name: '新建思维导图' })).toBeVisible()
    await page.evaluate(async ({ documents, folders }) => {
      const { appDatabase } = await import('/src/db/appDatabase.ts')
      const { useDocumentStore } = await import('/src/stores/documentStore.ts')
      await appDatabase.documents.bulkPut(documents)
      await appDatabase.folders.bulkPut(folders)
      useDocumentStore.getState().hydrate(documents, folders)
      const { flushLocalPersistence } = await import('/src/services/persistence/localPersistence.ts')
      await flushLocalPersistence()
    }, { documents: testDocuments, folders: testFolders })
    await runFixture(page)
  },
})
export { expect }
export type { Page, Locator } from '@playwright/test'
