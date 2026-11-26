import { expect, test, toast } from '../support/fixtures'
import { month } from '../support/settings'

/*
  Bulk import: a CSV file is checked in the dialog, imported in one go, the
  toast leads to exactly those entries, and the import can be undone.
*/
const FILE = 'e2e-import.csv'

test('import entries from a CSV file and undo the import', async ({ page }) => {
  const csv = [
    'Month,Source,Amount,Unit',
    `${month(1)},UK electricity · Electricity generated · Electricity: UK,850,kWh`,
    `${month(1)},Water supply · Water supply,12,cubic metres`,
  ].join('\n')

  await page.goto('/emissions/new')
  await page.getByRole('button', { name: 'Import from file' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Spreadsheet to import').setInputFiles({ name: FILE, mimeType: 'text/csv', buffer: Buffer.from(csv) })

  await dialog.getByRole('button', { name: 'Import 2 entries' }).click()
  const imported = toast(page, `Imported 2 entries from ${FILE}`)
  await expect(imported).toBeVisible()
  await expect(dialog).toBeHidden()
  await imported.getByRole('button', { name: 'View entries' }).click()

  await page.waitForURL('**/emissions**')
  // The filter chip (exact: the toast "Imported ... from <file>" may still be showing)
  await expect(page.getByText(`From ${FILE}`, { exact: true })).toBeVisible()
  await expect(page.locator('main tbody tr')).toHaveCount(2)

  // Undo, from the dialog's list of recent imports
  await page.goto('/emissions/new')
  await page.getByRole('button', { name: 'Import from file' }).click()
  const recent = page.getByRole('dialog').locator('li').filter({ hasText: FILE }).first()
  await recent.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo import' }).click()
  await expect(toast(page, `Undid the import of ${FILE}: 2 entries deleted`)).toBeVisible()
  await expect(recent).toContainText('Undone by')
})
