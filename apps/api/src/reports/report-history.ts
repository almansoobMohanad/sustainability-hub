import { sql, type Database } from '@hub/db'
import { esgReadyReportEdits, esgReadyReports, sedgReportEdits, sedgReports, users } from '@hub/db/schema'

/*
  What the reports (SEDG, ESG Ready) share: their edit history. Autosave sends
  a change a moment after someone stops typing, so instead of one history row
  per save, a person's saves within 15 minutes of each other are merged into
  one row ("Aisyah edited E2.1, E3.1 between 14:05 and 14:20"). The list is
  newest first, in keyset pages.

  Both reports have the same table shapes, so these work on either pair
  (plain SQL with the tables' names; the values are always parameters).
*/

export type ReportTables =
  | { reports: typeof sedgReports; edits: typeof sedgReportEdits }
  | { reports: typeof esgReadyReports; edits: typeof esgReadyReportEdits }

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const EDIT_MERGE_MINUTES = 15
const HISTORY_PAGE = 20

/** A text[] from ONE jsonb parameter (a JS array in a sql`` template would become one parameter per element) */
export const textArray = (items: string[]) =>
  sql`array(select jsonb_array_elements_text(${JSON.stringify(items)}::jsonb))::text[]`

/** Adds `changed` to this person's recent edit of the report, or starts a new one */
export async function recordEdit(
  tx: Transaction,
  edits: ReportTables['edits'],
  { reportId, actorId, changed }: { reportId: string; actorId: string; changed: string[] },
) {
  const extended = await tx.execute(sql`
    update ${edits} set
      ended_at = now(),
      changed = array(select distinct unnest(${edits.changed} || ${textArray(changed)}) order by 1)
    where ${edits.id} = (
      select id from ${edits}
       where ${edits.reportId} = ${reportId} and ${edits.actorId} = ${actorId}
         and ${edits.endedAt} > now() - make_interval(mins => ${EDIT_MERGE_MINUTES})
       order by ${edits.endedAt} desc limit 1
    )
  `)
  if (extended.rowCount === 0) {
    await tx.execute(sql`
      insert into ${edits} (report_id, actor_id, changed)
      values (${reportId}, ${actorId}, ${textArray([...changed].sort())})
    `)
  }
}

/** Keyset cursor for the history: [ended_at as text (microseconds), id] */
const encodeCursor = (endedAt: string, id: string) => Buffer.from(JSON.stringify([endedAt, id])).toString('base64url')
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === 'string')
      ? (value as [string, string])
      : null
  } catch {
    return null
  }
}

export type EditItem = {
  id: string
  actor: { id: string; name: string } | null
  startedAt: string
  endedAt: string
  changed: string[]
}

/** One page of a company's edits of one year's report, newest first; null for an invalid cursor */
export async function listEdits(
  db: Database,
  { reports, edits }: ReportTables,
  { companyId, year, cursor }: { companyId: string; year: number; cursor?: string },
): Promise<{ items: EditItem[]; nextCursor: string | null } | null> {
  const after = cursor ? decodeCursor(cursor) : null
  if (cursor && !after) return null

  const { rows } = await db.execute<{
    id: string
    started_at: Date | string
    ended_at: Date | string
    ended_at_text: string
    changed: string[]
    actor_id: string | null
    actor_name: string | null
  }>(sql`
    select e.id, e.started_at, e.ended_at, e.ended_at::text as ended_at_text, e.changed,
           u.id as actor_id, u.name as actor_name
      from ${edits} e
      join ${reports} r on r.id = e.report_id
      left join ${users} u on u.id = e.actor_id
     where r.organization_id = ${companyId} and r.year = ${year}
       ${after ? sql`and (e.ended_at, e.id) < (${after[0]}::timestamptz, ${after[1]}::uuid)` : sql``}
     order by e.ended_at desc, e.id desc
     limit ${HISTORY_PAGE + 1}
  `)
  const page = rows.slice(0, HISTORY_PAGE)
  const last = page.at(-1)
  return {
    items: page.map((row) => ({
      id: row.id,
      actor: row.actor_id ? { id: row.actor_id, name: row.actor_name ?? '' } : null,
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(),
      changed: row.changed,
    })),
    nextCursor: rows.length > HISTORY_PAGE && last ? encodeCursor(last.ended_at_text, last.id) : null,
  }
}
