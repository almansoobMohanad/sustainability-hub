import { expect, test as base, type Page } from '@playwright/test'

/*
  `test` for the app's tests: fails a test when the page logs an error, throws,
  or the browser blocks something because of the security policy (CSP), even
  if everything on screen looked right. In CI this runs against the production
  image, so a CSP change that breaks a feature is caught here.
*/

// Status codes the app expects and handles itself (signed out, not found, rate limited)
const EXPECTED = /status of (401|404|429)/

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = []
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) =>
          console.error(`CSP blocked ${event.violatedDirective}: ${event.blockedURI || '(inline)'}`),
        )
      })
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !EXPECTED.test(message.text())) problems.push(`console error: ${message.text()}`)
      })
      await use(problems)
      expect(problems, 'errors in the browser console').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** The toast (pop-up message) with this text */
export const toast = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text })
