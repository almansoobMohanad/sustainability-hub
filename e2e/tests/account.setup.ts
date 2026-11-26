import { expect, test } from '../support/fixtures'
import { linkInEmail } from '../support/mailpit'
import { ACCOUNT_STATE, newAccount, saveAccount } from '../support/settings'

/*
  Runs first: a new person signs up, confirms their email from the
  verification email, and creates a company with a sector template. The
  signed-in browser state is saved for the other tests.
*/
test('sign up, verify the email and create a company', async ({ page }) => {
  const account = newAccount()

  await page.goto('/sign-up')
  await page.getByLabel('Full name').fill(account.name)
  await page.getByLabel('Work email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/check-email**')

  await page.goto(await linkInEmail(account.email, 'Verify your email'))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL('**/create-company')

  await page.getByLabel('Company name').fill(account.company)
  await page.getByLabel('Sector').click()
  await page.getByRole('option', { name: 'Office and professional services' }).click()
  // The sector's template: the sources the company will track
  await expect(page.getByText('Emission sources to track')).toBeVisible()
  await page.getByRole('button', { name: 'Create company' }).click()

  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.getByRole('button', { name: new RegExp(account.company) })).toBeVisible()

  await page.context().storageState({ path: ACCOUNT_STATE })
  saveAccount(account)
})
