import { queryOptions, useSuspenseQuery, type QueryClient } from '@tanstack/react-query'
import type { Role } from '@hub/shared/permissions'

/*
  GET /api/v1/me: the signed-in person, their companies and roles, and the
  active company. Loaded by the _app route guard, so pages inside the sidebar
  layout can read it synchronously with useMe().
*/

export type CompanyMembership = { id: string; name: string; role: Role }

export type Me = {
  user: { id: string; name: string; email: string; image: string | null }
  activeCompanyId: string | null
  companies: CompanyMembership[]
}

export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    const response = await fetch('/api/v1/me')
    if (response.status === 401) return null // signed out (or the session ended)
    if (!response.ok) throw new Error(`Could not load your account (HTTP ${response.status}).`)
    return (await response.json()) as Me
  },
  staleTime: 60_000,
})

/** The signed-in person and their active company (only inside the _app layout). */
export function useMe() {
  const { data } = useSuspenseQuery(meQueryOptions)
  if (!data) throw new Error('useMe() used outside a signed-in page')
  const company = data.companies.find((c) => c.id === data.activeCompanyId) ?? null
  return { ...data, company, role: company?.role ?? null }
}

/**
 * After switching, creating, joining or leaving a company: forget everything
 * cached except "who is signed in", so no data from the previous company can
 * be shown in the next one.
 */
export function forgetCompanyData(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
}
