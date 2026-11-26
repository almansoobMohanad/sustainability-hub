import { expect, test, toast } from '../support/fixtures'
import { month } from '../support/settings'

/*
  The main path: add an entry with the form, find it on Entries as Pending,
  verify it, and see it on the dashboard. The source is UK grid electricity,
  which every sector template includes.
*/
const SOURCE = 'Electricity: UK'

test('add an entry, verify it and see it on the dashboard', async ({ page }) => {
  await page.goto('/emissions/new')
  await page.locator('label', { hasText: 'Scope 2' }).click()
  await page.locator('#category').click()
  await page.getByRole('option', { name: 'UK electricity' }).click()
  await page.locator('#sourceId').click()
  await page.getByRole('option').filter({ hasText: SOURCE }).click()
  await page.locator('#amount').fill('1200')
  await page.locator('#period').fill(month())
  // The calculation is shown before saving (the factor of that month's year)
  await expect(page.getByText(/t CO2e/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Add entry' }).click()

  const added = toast(page, 'Entry added')
  await expect(added).toBeVisible()
  await added.getByRole('button', { name: 'View entries' }).click()
  await page.waitForURL('**/emissions**')

  const row = page.locator('main tbody tr').filter({ hasText: SOURCE })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Pending')
  await row.getByRole('button', { name: /^Verify / }).click()
  await expect(toast(page, 'Entry verified')).toBeVisible()
  await expect(row).toContainText('Verified')

  await page.goto('/')
  await expect(page.getByRole('main').getByText(SOURCE).first()).toBeVisible()
  await expect(page.getByRole('main').getByText('t CO2e').first()).toBeVisible()
})
