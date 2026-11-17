import { queryOptions } from '@tanstack/react-query'

/*
  Which sign-in methods this installation offers (GET /api/v1/auth-options).
  Google sign-in is optional: offline/desktop installs don't configure it, and
  then the button simply isn't shown.
*/
export type AuthOptions = { emailPassword: boolean; google: boolean }

const FALLBACK: AuthOptions = { emailPassword: true, google: false }

export const authOptionsQueryOptions = queryOptions({
  queryKey: ['auth-options'],
  queryFn: async (): Promise<AuthOptions> => {
    try {
      const response = await fetch('/api/v1/auth-options')
      if (!response.ok) return FALLBACK
      return (await response.json()) as AuthOptions
    } catch {
      // Can't reach the API: still show the email form (it explains errors itself)
      return FALLBACK
    }
  },
  staleTime: Infinity, // only changes when the server is reconfigured
})
