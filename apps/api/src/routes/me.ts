import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { asc, eq, type Database } from '@hub/db'
import { members, organizations } from '@hub/db/schema'
import { ROLES } from '@hub/shared/permissions'
import type { Auth } from '../auth/auth'
import { requireSession, type AuthVariables } from '../auth/require-session'
import { errorResponse } from './common'

/*
  GET /api/v1/me
  The signed-in person, every company they belong to with their role in it,
  and which company is active in this session. The app uses it for the
  sidebar (company switcher, name, avatar) and to decide which actions to show.
  One query: memberships joined with companies.
*/

const CompanySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(ROLES),
  })
  .openapi('CompanyMembership')

const MeSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      name: z.string(),
      email: z.email(),
      image: z.string().nullable(),
    }),
    /** null when the person has no company yet (they're sent to "Create your company") */
    activeCompanyId: z.uuid().nullable(),
    companies: z.array(CompanySchema),
  })
  .openapi('Me')

const route = createRoute({
  method: 'get',
  path: '/v1/me',
  tags: ['Account'],
  summary: 'The signed-in person and their companies',
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: MeSchema } } },
    401: errorResponse('Not signed in'),
  },
})

export function meRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>()
  app.use('/v1/me', requireSession(auth))
  return app.openapi(route, async (c) => {
    const user = c.var.user
    const rows = await db
      .select({ id: organizations.id, name: organizations.name, role: members.role })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(eq(members.userId, user.id))
      .orderBy(asc(organizations.name))

    // Roles are stored as text; anything unexpected is treated as the least privileged
    const companies = rows.map((row) => ({
      ...row,
      role: (ROLES as readonly string[]).includes(row.role) ? (row.role as (typeof ROLES)[number]) : ('member' as const),
    }))
    // Only report the active company if the person is (still) a member of it
    const active = companies.find((company) => company.id === c.var.session.activeOrganizationId)

    return c.json(
      {
        user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
        activeCompanyId: active?.id ?? null,
        companies,
      },
      200,
    )
  })
}
