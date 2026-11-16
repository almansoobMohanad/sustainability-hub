import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'

/*
  "Who is signed in?" lives in the TanStack Query cache like any other server
  data. Route guards read it with ensureQueryData (fetched once, then cached),
  and components with useQuery. After signing in or out, the cache is cleared
  so the next read asks the API again.
*/
export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const { data, error } = await authClient.getSession()
    if (error) throw new Error(error.message || 'Could not check whether you are signed in.')
    return data ?? null // null = signed out
  },
  staleTime: 5 * 60_000,
})

/** Forget the cached session (after sign-in/out or verification). */
export function forgetSession(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey })
}

/** For sign-in/sign-up pages: someone already signed in goes to the dashboard. */
export async function redirectIfSignedIn(queryClient: QueryClient) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions)
  if (session) throw redirect({ to: '/' })
}
