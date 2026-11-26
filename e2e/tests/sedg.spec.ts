import { readFileSync } from 'node:fs'
import { expect, test } from '../support/fixtures'

/*
  The SEDG disclosure: reached from the sidebar (the test account is an Admin),
  a figure calculated from the verified electricity entry (entries.spec.ts runs
  first), autosave that survives a reload, the level, and the PDF download. In
  CI this runs against the production image, so the PDF engine also proves it
  works under the app's security policy (it needs WebAssembly).
*/
test('fill in the SEDG disclosure, see it saved, and download the PDF', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'SEDG disclosure' }).click()
  await page.waitForURL('**/reports/sedg**')

  // Scope 2 comes from the verified electricity entry
  const scope2 = page.getByRole('region', { name: 'E1.2', exact: true })
  await expect(scope2.getByText('Calculated', { exact: true })).toBeVisible()
  await expect(scope2.getByText('From 1 verified entry')).toBeVisible()

  // Autosave: no button, the line under the title says when it's saved
  await page.getByLabel('Location of headquarters').fill('Shah Alam, Selangor')
  await page.getByLabel('Number of directors').fill('5')
  await expect(page.getByText(/^Saved · edited by E2E Tester/)).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(page.getByLabel('Location of headquarters')).toHaveValue('Shah Alam, Selangor')
  await expect(page.getByLabel('Number of directors')).toHaveValue('5')

  // An invalid value is explained and not saved
  await page.getByLabel('Number of injuries').fill('2.5')
  await expect(page.getByText('Enter a whole number, 0 or more.')).toBeVisible()

  // Intermediate adds disclosures, and reductions need a baseline year
  await page.locator('label', { hasText: 'Intermediate' }).click()
  await expect(page.getByRole('region', { name: 'E1.3', exact: true })).toBeVisible()
  await expect(page.getByText('Reductions need a baseline year.')).toBeVisible()

  // History lists the edits
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('dialog').getByText('E2E Tester').first()).toBeVisible()
  await page.keyboard.press('Escape')

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
  expect(download.suggestedFilename()).toMatch(/^SEDG \d{4} - E2E Test Company \d+\.pdf$/)
  const file = readFileSync(await download.path())
  expect(file.subarray(0, 5).toString()).toBe('%PDF-')
  expect(file.length).toBeGreaterThan(5_000)
})
