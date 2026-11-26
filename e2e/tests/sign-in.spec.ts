import { expect, test } from '../support/fixtures'
import { savedAccount } from '../support/settings'

/*
  Signing in from a fresh browser (its own session, so signing out at the end
  doesn't end the session the other tests use). Sign-in is a POST with the
  page's referrer policy, which Better Auth's origin check depends on.
*/
test.use({ storageState: { cookies: [], origins: [] } })

test('sign in, with a wrong password first, then sign out', async ({ page }) => {
  const account = savedAccount()

  await page.goto('/')
  await page.waitForURL('**/sign-in**')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(`${account.password} wrong`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText(/incorrect|invalid|wrong/i)).toBeVisible()

  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.getByRole('button', { name: new RegExp(account.company) })).toBeVisible()

  await page.locator('[data-sidebar="footer"] button').last().click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('**/sign-in**')
})
