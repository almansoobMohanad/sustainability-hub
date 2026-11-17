import { and, eq, type Database } from '@hub/db'
import { users } from '@hub/db/schema'

/*
  "Google wins" over an unverified account (see AGENTS.md, section 2a).

  The attack this prevents ("pre-account hijacking"): someone signs up with
  YOUR email and a password they choose. They can't verify it (they don't have
  your inbox), but the account row exists. If you later click "Continue with
  Google" and the two were merged, their password would open your account.

  So when Google proves someone owns an email (email_verified), any account
  with that email that was NEVER verified is deleted. It holds nothing worth
  keeping: unverified accounts can't sign in, so they have no sessions or data.
  Its password and sessions go with it (the database cascades the delete).
  Better Auth then creates a fresh account from Google.

  Accounts whose email WAS verified are never touched: Better Auth links Google
  to them, because both sides proved ownership of the same email.
*/

/**
 * Deletes the account with this email if, and only if, its email was never
 * verified. One statement, so it can't race with a verification happening at
 * the same moment. Returns true if an account was removed.
 */
export async function deleteUnverifiedAccount(db: Database, email: string) {
  const removed = await db
    .delete(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.emailVerified, false)))
    .returning({ id: users.id })
  return removed.length > 0
}
