import { readFileSync } from 'node:fs'
import { expect, test } from '../support/fixtures'

/*
  ESG Ready: reached from the sidebar (the test account is an Admin), the score
  follows the answers, answers are saved automatically and survive a reload,
  a follow-up question appears only when it applies, and the PDF downloads.
*/
test('answer the ESG Ready self-assessment, see the score, and download the PDF', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'ESG Ready' }).click()
  await page.waitForURL('**/reports/esg-ready**')
  await expect(page.getByText('0 of 108 points')).toBeVisible()

  const question = (title: string) => page.getByRole('region', { name: title })
  // 2 points (the third of four statements) + 2 stakeholders = 4 points
  await question("How mature is your organization's sustainability strategy?")
    .getByLabel('We are progressing well, but there is room for improvement')
    .check()
  const stakeholders = question('Which stakeholders do you actively engage with?')
  await stakeholders.getByLabel('Customers').check()
  await stakeholders.getByLabel('Employees').check()
  await expect(page.getByText('4 of 108 points')).toBeVisible()

  // A follow-up question appears only after "None of the above"
  const reasons = question("If you selected 'None' in Q6, please explain why")
  await expect(reasons).toHaveCount(0)
  await question('Which sustainability reporting standards does your organization use?').getByLabel('None of the above').check()
  await expect(reasons).toBeVisible()

  await expect(page.getByText(/^Saved · edited by E2E Tester/)).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(page.getByText('4 of 108 points')).toBeVisible()
  await expect(stakeholders.getByLabel('Employees')).toBeChecked()

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
  expect(download.suggestedFilename()).toMatch(/^ESG Ready \d{4} - E2E Test Company \d+\.pdf$/)
  const file = readFileSync(await download.path())
  expect(file.subarray(0, 5).toString()).toBe('%PDF-')
})
