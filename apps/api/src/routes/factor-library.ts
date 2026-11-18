import { createRoute, z } from '@hono/zod-openapi'
import { and, asc, count, eq, inArray, sql, UK_FACTOR_LIBRARY, type Database } from '@hub/db'
import { emissionSources, factorLibraries, factorSets } from '@hub/db/schema'
import { SECTORS } from '@hub/shared/sectors'
import type { Auth } from '../auth/auth'
import { requireSession, type AuthVariables } from '../auth/require-session'
import { FactorValueSchema, factorValuesFor } from '../factors/factor-values'
import { resolveSectorTemplates } from '../factors/sector-templates'
import { createRouter, currentYear, errorResponse } from './common'

/*
  The emission factor library (the same for every company), for signed-in people.

    GET /api/v1/factor-library                  what it is (publisher, licence), which years exist
    GET /api/v1/emission-sources                search + filter, ONE PAGE at a time (cursor)
    GET /api/v1/emission-sources/categories     the categories (with counts) for filter menus
    GET /api/v1/sector-templates/{sector}       the sources suggested for one sector

  The library has thousands of sources and factors and keeps growing (more
  years, more libraries, custom factors), so nothing here ever returns all of
  it: every list is filtered and paged in the database, and only the fields a
  list shows are sent. Factor values are looked up for the current page only,
  for one reporting year.
*/

export const SourceSchema = z
  .object({
    id: z.uuid(),
    scope: z.number().int().min(1).max(3),
    category: z.string().openapi({ example: 'Fuels' }),
    name: z.string().openapi({ example: 'Liquid fuels · Diesel (average biofuel blend)' }),
  })
  .openapi('EmissionSource')

export const SourceWithFactorsSchema = SourceSchema.extend({
  /** Every unit the source can be measured in, with its factor for the requested year */
  factors: z.array(FactorValueSchema),
}).openapi('EmissionSourceWithFactors')

/** Only what lists show (never the key, path, sort order or search text) */
export const sourceColumns = {
  id: emissionSources.id,
  scope: emissionSources.scope,
  category: emissionSources.category,
  name: emissionSources.name,
}

const YearQuery = z.coerce
  .number()
  .int()
  .min(1990)
  .max(2100)
  .optional()
  .openapi({ description: 'Reporting year for the factor values (default: the current year)' })

/*
  Keyset pagination: the cursor is the position of the last row sent,
  "<scope>-<sortOrder>". The next page starts after it, using the
  (library, scope, sort_order) index directly. Unlike OFFSET, the database
  never reads and throws away the rows of earlier pages, so page 30 costs the
  same as page 1.
*/
const CURSOR = /^([1-3])-(\d{1,9})$/
const encodeCursor = (row: { scope: number; sortOrder: number }) => `${row.scope}-${row.sortOrder}`

const libraryRoute = createRoute({
  method: 'get',
  path: '/v1/factor-library',
  tags: ['Emission factors'],
  summary: 'The factor library and the years it covers',
  responses: {
    200: {
      description: 'The library',
      content: {
        'application/json': {
          schema: z
            .object({
              title: z.string(),
              publisher: z.string(),
              licence: z.string(),
              licenceUrl: z.string(),
              years: z.array(z.object({ year: z.number().int(), version: z.string(), sourceUrl: z.string() })),
            })
            .openapi('FactorLibrary'),
        },
      },
    },
    401: errorResponse('Not signed in'),
    503: errorResponse('The library has not been loaded'),
  },
})

const searchRoute = createRoute({
  method: 'get',
  path: '/v1/emission-sources',
  tags: ['Emission factors'],
  summary: 'Search and filter the factor library, one page at a time',
  description:
    'Filters combine (AND). Pass `nextCursor` from a response as `cursor` to get the next page; ' +
    '`total` is only computed for the first page (no cursor).',
  request: {
    query: z.object({
      q: z.string().trim().max(100).optional().openapi({ description: 'Words that must all appear, e.g. "diesel van"' }),
      scope: z.coerce.number().int().min(1).max(3).optional(),
      category: z.string().trim().min(1).max(100).optional().openapi({ description: 'e.g. "Fuels" (see /categories)' }),
      sector: z.enum(SECTORS).optional().openapi({ description: "Only the sources in this sector's template" }),
      year: YearQuery,
      limit: z.coerce.number().int().min(1).max(50).default(30),
      cursor: z.string().regex(CURSOR, 'Invalid cursor').optional(),
    }),
  },
  responses: {
    200: {
      description: 'One page of matching sources, in the publisher order',
      content: {
        'application/json': {
          schema: z
            .object({
              year: z.number().int(),
              items: z.array(SourceWithFactorsSchema),
              /** null on the last page */
              nextCursor: z.string().nullable(),
              /** Number of matches; only on the first page (null when a cursor is given) */
              total: z.number().int().nullable(),
            })
            .openapi('EmissionSourcePage'),
        },
      },
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
  },
})

const categoriesRoute = createRoute({
  method: 'get',
  path: '/v1/emission-sources/categories',
  tags: ['Emission factors'],
  summary: 'Categories of the library with the number of sources in each (for filters)',
  request: { query: z.object({ scope: z.coerce.number().int().min(1).max(3).optional() }) },
  responses: {
    200: {
      description: 'Categories in the publisher order',
      content: {
        'application/json': {
          schema: z.object({
            categories: z.array(
              z.object({ scope: z.number().int(), category: z.string(), count: z.number().int() }).openapi('SourceCategory'),
            ),
          }),
        },
      },
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
  },
})

const templateRoute = createRoute({
  method: 'get',
  path: '/v1/sector-templates/{sector}',
  tags: ['Emission factors'],
  summary: "The emission sources suggested for one sector",
  request: { params: z.object({ sector: z.enum(SECTORS) }) },
  responses: {
    200: {
      description: 'The template (a few dozen sources at most)',
      content: {
        'application/json': {
          schema: z
            .object({ sector: z.enum(SECTORS), sources: z.array(SourceSchema.extend({ defaultUnit: z.string() })) })
            .openapi('SectorTemplate'),
        },
      },
    },
    400: errorResponse('Unknown sector'),
    401: errorResponse('Not signed in'),
  },
})

/** "%" and "_" typed by someone are meant literally, not as LIKE wildcards */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

export function factorLibraryRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = createRouter<{ Variables: AuthVariables }>()
  app.use('/v1/factor-library', requireSession(auth))
  app.use('/v1/emission-sources', requireSession(auth))
  app.use('/v1/emission-sources/*', requireSession(auth))
  app.use('/v1/sector-templates/*', requireSession(auth))

  app.openapi(libraryRoute, async (c) => {
    const [library] = await db
      .select({
        title: factorLibraries.title,
        publisher: factorLibraries.publisher,
        licence: factorLibraries.licence,
        licenceUrl: factorLibraries.licenceUrl,
      })
      .from(factorLibraries)
      .where(eq(factorLibraries.code, UK_FACTOR_LIBRARY))
    if (!library) {
      return c.json({ error: { code: 'library_not_loaded', message: 'The emission factor library is not loaded.' } }, 503)
    }
    const years = await db
      .select({ year: factorSets.year, version: factorSets.version, sourceUrl: factorSets.sourceUrl })
      .from(factorSets)
      .where(eq(factorSets.libraryCode, UK_FACTOR_LIBRARY))
      .orderBy(asc(factorSets.year))
    return c.json({ ...library, years }, 200)
  })

  app.openapi(searchRoute, async (c) => {
    const { q, scope, category, sector, limit, cursor } = c.req.valid('query')
    const year = c.req.valid('query').year ?? currentYear()

    const sectorIds = sector ? (await resolveSectorTemplates(db)).templates[sector].map((item) => item.sourceId) : null
    if (sectorIds?.length === 0) return c.json({ year, items: [], nextCursor: null, total: 0 }, 200)
    // Every word must appear ("diesel van" finds "Vans · Average · Diesel"); served by the trigram index
    const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)
    const filters = [
      eq(emissionSources.libraryCode, UK_FACTOR_LIBRARY),
      scope ? eq(emissionSources.scope, scope) : undefined,
      category ? eq(emissionSources.category, category) : undefined,
      sectorIds ? inArray(emissionSources.id, sectorIds) : undefined,
      ...words.map((word) => sql`${emissionSources.searchText} like ${`%${escapeLike(word)}%`}`),
    ]
    const position = cursor ? CURSOR.exec(cursor)! : null
    const afterCursor = position
      ? sql`(${emissionSources.scope}, ${emissionSources.sortOrder}) > (${Number(position[1])}, ${Number(position[2])})`
      : undefined

    const [rows, total] = await Promise.all([
      db
        .select({ ...sourceColumns, sortOrder: emissionSources.sortOrder })
        .from(emissionSources)
        .where(and(...filters, afterCursor))
        .orderBy(asc(emissionSources.scope), asc(emissionSources.sortOrder))
        .limit(limit + 1), // one extra row tells whether there is a next page
      // Counting every match costs a little, so only for the first page
      position
        ? Promise.resolve(null)
        : db
            .select({ total: count() })
            .from(emissionSources)
            .where(and(...filters))
            .then(([row]) => row.total),
    ])

    const page = rows.slice(0, limit)
    const factors = await factorValuesFor(
      db,
      page.map((row) => row.id),
      year,
    )
    return c.json(
      {
        year,
        items: page.map(({ id, scope, category, name }) => ({ id, scope, category, name, factors: factors.get(id) ?? [] })),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
        total,
      },
      200,
    )
  })

  app.openapi(categoriesRoute, async (c) => {
    const { scope } = c.req.valid('query')
    const categories = await db
      .select({ scope: emissionSources.scope, category: emissionSources.category, count: count() })
      .from(emissionSources)
      .where(and(eq(emissionSources.libraryCode, UK_FACTOR_LIBRARY), scope ? eq(emissionSources.scope, scope) : undefined))
      .groupBy(emissionSources.scope, emissionSources.category)
      .orderBy(asc(emissionSources.scope), sql`min(${emissionSources.sortOrder})`)
    return c.json({ categories }, 200)
  })

  app.openapi(templateRoute, async (c) => {
    const { sector } = c.req.valid('param')
    const items = (await resolveSectorTemplates(db)).templates[sector]
    const unitById = new Map(items.map((item) => [item.sourceId, item.defaultUnit]))
    // Library order (scope 1, 2, 3, then the publisher's order), like every other list
    const sources = items.length
      ? await db
          .select(sourceColumns)
          .from(emissionSources)
          .where(inArray(emissionSources.id, [...unitById.keys()]))
          .orderBy(asc(emissionSources.scope), asc(emissionSources.sortOrder))
      : []
    return c.json({ sector, sources: sources.map((source) => ({ ...source, defaultUnit: unitById.get(source.id)! })) }, 200)
  })

  return app
}
