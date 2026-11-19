import { and, desc, eq, sql, type Database } from '@hub/db'
import { emissionEntries } from '@hub/db/schema'

/*
  The dashboard's numbers for one year, calculated by Postgres: ONE grouped
  query returns at most 2 years x 12 months x 3 scopes = 72 small rows (the
  year and the year before, for the like-for-like comparison), whatever the
  number of entries. The company + period index serves the date range.

  Rejected entries never count. Pending entries count in the totals (they are
  the company's best current data) and are also reported separately, so the
  page can say how much of the total still awaits verification.
*/

type ScopeTotals = { 1: number; 2: number; 3: number }
const emptyTotals = (): ScopeTotals => ({ 1: 0, 2: 0, 3: 0 })

export async function yearSummary(db: Database, companyId: string, year: number) {
  const status = emissionEntries.status
  const kg = emissionEntries.co2eKg
  const [rows, years] = await Promise.all([
    db
      .select({
        year: emissionEntries.reportingYear,
        month: sql<number>`extract(month from ${emissionEntries.periodStart})::int`.mapWith(Number),
        scope: emissionEntries.scope,
        kg: sql<number>`coalesce(sum(${kg}) filter (where ${status} <> 'rejected'), 0)`.mapWith(Number),
        pendingKg: sql<number>`coalesce(sum(${kg}) filter (where ${status} = 'pending'), 0)`.mapWith(Number),
        entries: sql<number>`count(*) filter (where ${status} <> 'rejected')`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${status} = 'pending')`.mapWith(Number),
      })
      .from(emissionEntries)
      .where(
        and(
          eq(emissionEntries.organizationId, companyId),
          sql`${emissionEntries.periodStart} >= ${`${year - 1}-01-01`}::date`,
          sql`${emissionEntries.periodStart} < ${`${year + 1}-01-01`}::date`,
        ),
      )
      .groupBy(emissionEntries.reportingYear, sql`2`, emissionEntries.scope),
    // Years that have entries, for the year menu
    db
      .selectDistinct({ year: emissionEntries.reportingYear })
      .from(emissionEntries)
      .where(eq(emissionEntries.organizationId, companyId))
      .orderBy(desc(emissionEntries.reportingYear)),
  ])

  const months = Array.from({ length: 12 }, (_, month) => ({
    month,
    byScope: emptyTotals(),
    total: 0,
    entries: 0,
  }))
  const byScope = emptyTotals()
  let pendingKg = 0
  let pendingEntries = 0
  const previousByMonth = new Array<number>(12).fill(0)
  const previousHasMonth = new Array<boolean>(12).fill(false)

  for (const row of rows) {
    const scope = row.scope as 1 | 2 | 3
    const month = row.month - 1
    if (row.year === year) {
      months[month].byScope[scope] += row.kg
      months[month].total += row.kg
      months[month].entries += row.entries
      byScope[scope] += row.kg
      pendingKg += row.pendingKg
      pendingEntries += row.pending
    } else if (row.entries > 0) {
      previousByMonth[month] += row.kg
      previousHasMonth[month] = true
    }
  }

  const lastMonthWithData = months.findLastIndex((month) => month.entries > 0)
  // Like for like: the same months of last year, and only if last year has data for each of them
  let previousTotal = 0
  let previousComplete = lastMonthWithData >= 0
  for (const month of months) {
    if (month.entries === 0) continue
    if (!previousHasMonth[month.month]) previousComplete = false
    previousTotal += previousByMonth[month.month]
  }

  return {
    year,
    years: years.map((row) => row.year),
    totalKg: byScope[1] + byScope[2] + byScope[3],
    byScope,
    pendingKg,
    pendingEntries,
    lastMonthWithData,
    months: months.map((month) => ({ ...month, hasData: month.entries > 0 })),
    previousYearSamePeriod: { totalKg: previousTotal, complete: previousComplete },
  }
}
