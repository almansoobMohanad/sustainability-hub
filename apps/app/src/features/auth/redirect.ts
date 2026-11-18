/**
 * Where to go after signing in. The target comes from the URL
 * (/sign-in?redirect=/emissions/new), which anyone can craft, so only paths on
 * THIS site are allowed. Otherwise a link like
 * /sign-in?redirect=https://evil.example would send people to another site
 * right after they signed in (an "open redirect", popular for phishing).
 */
export function safeRedirectPath(target: unknown, fallback = '/') {
  if (typeof target !== 'string') return fallback
  // Must be a path ("/..."), not "//host" or "/\host" (browsers treat both as another site)
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback
  return target
}

/**
 * Where the link in a verification email should lead: the "Email verified"
 * page, carrying on to `redirectTo` afterwards (e.g. an invitation someone
 * clicked before they had an account).
 */
export function verifiedCallbackUrl(redirectTo?: string) {
  const target = safeRedirectPath(redirectTo, '')
  return target ? `/email-verified?redirect=${encodeURIComponent(target)}` : '/email-verified'
}

/** Optional search param helper for route validateSearch functions. */
export function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
