import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, eq, inArray, UK_FACTOR_LIBRARY, type Database } from '@hub/db'
import { companySettings, companySources, emissionSources } from '@hub/db/schema'
import { can } from '@hub/shared/permissions'
import { SECTORS, isSector } from '@hub/shared/sectors'
import type { Auth } from '../auth/auth'
import { requireCompany, type CompanyVariables } from '../auth/require-company'
import { requireSession } from '../auth/require-session'
import { factorValuesFor, unitsFor } from '../factors/factor-values'
import { createRouter, currentYear, errorResponse, forbidden } from './common'
import { SourceWithFactorsSchema, sourceColumns } from './factor-library'

/*
  A company's source list is returned whole (with factors for one year) because
  the Add emissions form needs all of it, so it's capped. Real companies track
  tens of sources; 300 leaves plenty of room while keeping that response small.
*/
const MAX_COMPANY_SOURCES = 300

/*
  The active company's settings and the emission sources it tracks.
  Always the session's active company (requireCompany), never an id from the request.

    GET    /api/v1/company/settings                 everyone in the company
    PATCH  /api/v1/company/settings                 Admin (sector, verification, baseline year)
    GET    /api/v1/company/sources?year=2026        everyone: the sources + factors for that year (max 300)
    POST   /api/v1/company/sources                  Admin, Manager: add sources
    DELETE /api/v1/company/sources/{sourceId}       Admin, Manager: stop tracking one
*/

const SettingsSchema = z
  .object({
    sector: z.enum(SECTORS).nullable(),
    /** New entries start Pending and need a Manager/Admin to verify them (false: verified automatically) */
    requireVerification: z.boolean(),
    /** The year reductions are measured against (SEDG reductions); null until chosen */
    baselineYear: z.number().int().nullable(),
  })
  .openapi('CompanySettings')

const CompanySourceSchema = SourceWithFactorsSchema.extend({
  /** Unit offered first when entering data */
  defaultUnit: z.string().nullable(),
}).openapi('CompanySource')

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/v1/company/settings',
  tags: ['Company'],
  summary: "The active company's settings",
  responses: {
    200: { description: 'Settings', content: { 'application/json': { schema: SettingsSchema } } },
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company, or not a member'),
  },
})

const patchSettingsRoute = createRoute({
  method: 'patch',
  path: '/v1/company/settings',
  tags: ['Company'],
  summary: "Change the active company's settings (Admin)",
  request: {
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              sector: z.enum(SECTORS).nullable().optional(),
              requireVerification: z.boolean().optional(),
              baselineYear: z.number().int().min(1990).nullable().optional(),
            })
            .refine((changes) => Object.keys(changes).length > 0, 'Nothing to change'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Saved', content: { 'application/json': { schema: SettingsSchema } } },
    400: errorResponse('Invalid request'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

const listSourcesRoute = createRoute({
  method: 'get',
  path: '/v1/company/sources',
  tags: ['Company'],
  summary: 'The emission sources the company tracks, with factors for a year',
  request: {
    query: z.object({
      year: z.coerce
        .number()
        .int()
        .min(1990)
        .max(2100)
        .optional()
        .openapi({ description: 'Reporting year (default: the current year)' }),
    }),
  },
  responses: {
    200: {
      description: 'Scope 1, 2, 3, each in the library order',
      content: {
        'application/json': { schema: z.object({ year: z.number().int(), sources: z.array(CompanySourceSchema) }) },
      },
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company, or not a member'),
  },
})

const addSourcesRoute = createRoute({
  method: 'post',
  path: '/v1/company/sources',
  tags: ['Company'],
  summary: 'Start tracking emission sources (Admin, Manager)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            sources: z
              .array(z.object({ sourceId: z.uuid(), defaultUnit: z.string().max(40).nullish() }))
              .min(1)
              .max(200),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Added (sources already tracked are left as they are)',
      content: { 'application/json': { schema: z.object({ added: z.number().int() }) } },
    },
    400: errorResponse('Invalid request or unknown source'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

const removeSourceRoute = createRoute({
  method: 'delete',
  path: '/v1/company/sources/{sourceId}',
  tags: ['Company'],
  summary: 'Stop tracking an emission source (Admin, Manager)',
  request: { params: z.object({ sourceId: z.uuid() }) },
  responses: {
    204: { description: 'Removed' },
    400: errorResponse('Invalid source id'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    404: errorResponse('The company does not track this source'),
  },
})

export function companyRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = createRouter<{ Variables: CompanyVariables }>()
  app.use('/v1/company/*', requireSession(auth), requireCompany(db))

  async function readSettings(companyId: string) {
    const [row] = await db
      .select({
        sector: companySettings.sector,
        requireVerification: companySettings.requireVerification,
        baselineYear: companySettings.baselineYear,
      })
      .from(companySettings)
      .where(eq(companySettings.organizationId, companyId))
    return {
      sector: isSector(row?.sector) ? row.sector : null,
      requireVerification: row?.requireVerification ?? true,
      baselineYear: row?.baselineYear ?? null,
    }
  }

  app.openapi(getSettingsRoute, async (c) => c.json(await readSettings(c.var.company.id), 200))

  app.openapi(patchSettingsRoute, async (c) => {
    if (!can(c.var.company.role, 'organization', 'update')) return c.json(forbidden, 403)
    const changes = c.req.valid('json')
    if (changes.baselineYear && changes.baselineYear > currentYear()) {
      return c.json({ error: { code: 'invalid_request', message: "The baseline year can't be in the future." } }, 400)
    }
    await db
      .insert(companySettings)
      .values({ organizationId: c.var.company.id, ...changes })
      .onConflictDoUpdate({ target: companySettings.organizationId, set: changes })
    return c.json(await readSettings(c.var.company.id), 200)
  })

  app.openapi(listSourcesRoute, async (c) => {
    const year = c.req.valid('query').year ?? currentYear()
    const rows = await db
      .select({ ...sourceColumns, defaultUnit: companySources.defaultUnit })
      .from(companySources)
      .innerJoin(emissionSources, eq(emissionSources.id, companySources.sourceId))
      .where(eq(companySources.organizationId, c.var.company.id))
      .orderBy(asc(emissionSources.scope), asc(emissionSources.sortOrder))
    const factors = await factorValuesFor(
      db,
      rows.map((row) => row.id),
      year,
    )
    return c.json({ year, sources: rows.map((row) => ({ ...row, factors: factors.get(row.id) ?? [] })) }, 200)
  })

  app.openapi(addSourcesRoute, async (c) => {
    if (!can(c.var.company.role, 'sources', 'update')) return c.json(forbidden, 403)
    const requested = c.req.valid('json').sources
    const ids = [...new Set(requested.map((item) => item.sourceId))]

    const known = await db
      .select({ id: emissionSources.id })
      .from(emissionSources)
      .where(and(eq(emissionSources.libraryCode, UK_FACTOR_LIBRARY), inArray(emissionSources.id, ids)))
    if (known.length !== ids.length) {
      return c.json({ error: { code: 'unknown_source', message: 'One or more sources do not exist.' } }, 400)
    }

    // Keep every company's list (sent whole to the Add emissions form) small
    const tracked = await db
      .select({ sourceId: companySources.sourceId })
      .from(companySources)
      .where(eq(companySources.organizationId, c.var.company.id))
    const trackedIds = new Set(tracked.map((row) => row.sourceId))
    const newCount = ids.filter((id) => !trackedIds.has(id)).length
    if (trackedIds.size + newCount > MAX_COMPANY_SOURCES) {
      return c.json(
        {
          error: {
            code: 'too_many_sources',
            message: `A company can track up to ${MAX_COMPANY_SOURCES} emission sources. Remove some you don't use first.`,
          },
        },
        400,
      )
    }

    // A default unit the source doesn't have is ignored (the first unit is offered instead)
    const units = await unitsFor(db, ids)
    const rows = ids.map((sourceId) => {
      const defaultUnit = requested.find((item) => item.sourceId === sourceId)?.defaultUnit ?? null
      return {
        organizationId: c.var.company.id,
        sourceId,
        defaultUnit: defaultUnit && units.get(sourceId)?.has(defaultUnit) ? defaultUnit : null,
        addedBy: c.var.user.id,
      }
    })
    const added = await db
      .insert(companySources)
      .values(rows)
      .onConflictDoNothing()
      .returning({ sourceId: companySources.sourceId })
    return c.json({ added: added.length }, 200)
  })

  app.openapi(removeSourceRoute, async (c) => {
    if (!can(c.var.company.role, 'sources', 'update')) return c.json(forbidden, 403)
    const { sourceId } = c.req.valid('param')
    const removed = await db
      .delete(companySources)
      .where(and(eq(companySources.organizationId, c.var.company.id), eq(companySources.sourceId, sourceId)))
      .returning({ sourceId: companySources.sourceId })
    if (removed.length === 0) {
      return c.json({ error: { code: 'not_found', message: 'The company does not track this source.' } }, 404)
    }
    return c.body(null, 204)
  })

  return app
}
