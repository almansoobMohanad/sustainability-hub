import { queryOptions } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'

/*
  Invitations waiting for the signed-in person's email address, from any
  company. Shown in the company switcher (with a dot on its button) and on the
  "Set up your company" page. Expired ones are left out (the API returns every
  pending one, expired or not). Refreshed when the person comes back to the
  tab, so a new invitation shows up without reloading.
*/
export const myInvitationsQueryOptions = queryOptions({
  queryKey: ['my-invitations'],
  queryFn: async () => {
    const { data, error } = await authClient.organization.listUserInvitations()
    if (error) return [] // not worth breaking a page over; the email link still works
    const now = new Date()
    return data.filter((invitation) => invitation.status === 'pending' && new Date(invitation.expiresAt) > now)
  },
  staleTime: 30_000,
  refetchOnWindowFocus: true,
})
