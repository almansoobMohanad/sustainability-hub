import { createMiddleware } from 'hono/factory'
import { and, eq, type Database } from '@hub/db'
import { members } from '@hub/db/schema'
import { isRole, type Role } from '@hub/shared/permissions'
import type { ApiError } from '../app'
import type { AuthVariables } from './require-session'

/*
  Protects company data (use after requireSession). The company is ALWAYS the
  session's active company, never an id sent by the browser, and membership is
  re-checked in the database on every request, so someone removed from a
  company loses access immediately, even with their session still open.

  Handlers read c.var.company.id (scope every query with it) and
  c.var.company.role (check permissions with can() from @hub/shared/permissions).
*/

export type CompanyVariables = AuthVariables & {
  company: { id: string; role: Role }
}

export function requireCompany(db: Database) {
  return createMiddleware<{ Variables: CompanyVariables }>(async (c, next) => {
    const companyId = c.var.session.activeOrganizationId
    if (!companyId) {
      return c.json<ApiError>({ error: { code: 'no_active_company', message: 'Choose or create a company first.' } }, 403)
    }
    const [membership] = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.organizationId, companyId), eq(members.userId, c.var.user.id)))
    if (!membership) {
      return c.json<ApiError>({ error: { code: 'not_a_member', message: "You're not a member of this company." } }, 403)
    }
    // Roles are stored as text; anything unexpected gets the least privileges
    c.set('company', { id: companyId, role: isRole(membership.role) ? membership.role : 'member' })
    await next()
  })
}
