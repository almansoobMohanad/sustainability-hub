import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { rolePermissions, statements } from '@hub/shared/permissions'

/*
  Calls the API's /api/auth/* endpoints (Better Auth). No address is given, so
  it uses the app's own origin: the Vite dev server (and CloudFront later)
  forwards /api to the API. The session cookie therefore belongs to the app's
  address, and no CORS setup is needed.

  Every method returns { data, error } instead of throwing for API errors.

  disableDefaultFetchPlugins: by default the client jumps to a request's
  `callbackURL` by itself after success (a full page load). We pass
  callbackURL for a different purpose (where the link in a verification email
  should lead), and this app navigates with the router itself, so that
  automatic jump is turned off. Google sign-in (next) must therefore redirect
  explicitly: window.location.href = data.url.
*/
// Same roles as the API (packages/shared/src/permissions.ts), so calls like
// inviteMember({ role: 'manager' }) are type-checked against real role names.
const accessControl = createAccessControl(statements)

export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  plugins: [
    // Companies, memberships, invitations (Better Auth's organization plugin)
    organizationClient({
      ac: accessControl,
      roles: {
        admin: accessControl.newRole(rolePermissions.admin),
        manager: accessControl.newRole(rolePermissions.manager),
        member: accessControl.newRole(rolePermissions.member),
      },
    }),
  ],
})

export type Session = typeof authClient.$Infer.Session
