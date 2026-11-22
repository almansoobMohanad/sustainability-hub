import type { secureHeaders } from 'hono/secure-headers'

/**
 * Security headers on every answer (Hono's secureHeaders). Also used for the
 * Vercel build, whose app files are served by Vercel and not by this code
 * (tools/vercel-output.ts copies the same headers into its routing rules).
 *
 * Safe defaults (nosniff, frame protection, HTTPS-only once seen over https, ...), except:
 * "no-referrer" would make browsers send `Origin: null` on the app's own POSTs, which
 * Better Auth's origin check (rightly) refuses. same-origin: full referrer to ourselves,
 * nothing to other sites.
 */
export const SECURE_HEADERS = {
  referrerPolicy: 'same-origin',
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
} satisfies Parameters<typeof secureHeaders>[0]
