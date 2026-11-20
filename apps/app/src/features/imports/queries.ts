import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { IMPORT_LIMITS, type ImportColumn, type ImportRowInput } from '@hub/shared/imports'
import { emissionKeys } from '@/features/emissions/queries'
import type { Scope } from '@/features/emissions/types'
import { api } from '@/lib/api'

/*
  Spreadsheet imports (/api/v1/emissions/imports). The file is read in the
  browser; its rows go to the API as JSON to be checked, then imported.
  Keys live under the company's emissions keys, so every change to entries
  (including an import or an undo) refreshes this list too.
*/

type Person = { id: string; name: string }

export type RowNote = { column: ImportColumn | null; message: string }

/** One row after the server's check (POST /emissions/imports/check) */
export type CheckedRow = {
  row: number
  problems: RowNote[]
  warnings: RowNote[]
  /** What will be saved; null when the row has problems */
  entry: {
    period: string
    source: { id: string; name: string; category: string }
    scope: Scope
    amount: number
    unit: string
    factorYear: number
    co2eKg: number
  } | null
}

export type EmissionImport = {
  id: string
  fileName: string
  entryCount: number
  skippedRows: number
  createdBy: Person | null
  createdAt: string
  undoneBy: Person | null
  undoneAt: string | null
  /** Entries of the import that still exist */
  remainingEntries: number
  /** Entries a person verified since (they block undo) */
  verifiedByPerson: number
}

const importKeys = {
  lists: (companyId: string) => [...emissionKeys.all(companyId), 'imports'] as const,
  detail: (companyId: string, id: string) => [...emissionKeys.all(companyId), 'import', id] as const,
}

/** Recent imports, newest first, 10 at a time */
export const importsQueryOptions = (companyId: string) =>
  infiniteQueryOptions({
    queryKey: importKeys.lists(companyId),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(IMPORT_LIMITS.pageSize) })
      if (pageParam) params.set('cursor', pageParam)
      return api<{ items: EmissionImport[]; nextCursor: string | null }>(`/emissions/imports?${params}`, { signal })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

export const importQueryOptions = (companyId: string, id: string) =>
  queryOptions({
    queryKey: importKeys.detail(companyId, id),
    queryFn: ({ signal }) => api<EmissionImport>(`/emissions/imports/${id}`, { signal }),
  })

/** Checks rows; saves nothing, so it's a mutation only in the sense of "a POST on demand" */
export function useCheckImport() {
  return useMutation({
    mutationFn: (rows: ImportRowInput[]) =>
      api<{ rows: CheckedRow[] }>('/emissions/imports/check', { method: 'POST', json: { rows } }).then((result) => result.rows),
  })
}

export type ImportRequest = { fileName: string; rows: ImportRowInput[]; skipInvalid: boolean; expectedEntries: number }

export function useImportRows(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: ImportRequest) => api<EmissionImport>('/emissions/imports', { method: 'POST', json: request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: emissionKeys.all(companyId) }),
  })
}

export function useUndoImport(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<EmissionImport>(`/emissions/imports/${id}/undo`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: emissionKeys.all(companyId) }),
  })
}
