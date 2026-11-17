/*
  Turns Better Auth error responses into messages for people. Unknown errors
  get a generic message; details stay in the browser console / server logs.
*/

type AuthError = { status: number; code?: string; message?: string }

export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again."

export const PASSWORD_HINT = 'At least 12 characters. A few random words make a strong, memorable password.'

export function authErrorMessage(error: AuthError) {
  if (error.status === 429) return 'Too many attempts. Please wait a few minutes and try again.'
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Incorrect email or password.'
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.'
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 12 characters.'
    case 'PASSWORD_TOO_LONG':
      return 'Use at most 128 characters.'
    case 'PASSWORD_COMPROMISED':
      return 'This password has appeared in a data breach, so it is not safe to use. Choose a different one.'
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'This link is invalid or has expired.'
  }
  if (error.status >= 500) return 'Something went wrong on our side. Please try again in a moment.'
  return 'Something went wrong. Please try again.'
}

/**
 * Google sign-in failures arrive as /sign-in?error=<code> (set by the API after
 * Google sends the person back). Codes are snake_case; normalise just in case.
 */
export function googleSignInErrorMessage(code: string) {
  switch (code.toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'access_denied':
      return 'Google sign-in was cancelled.'
    case 'account_not_linked':
    case 'unable_to_link_account':
      return "This email already has an account that couldn't be linked to Google automatically. Sign in with your email and password instead."
    case 'email_not_verified':
    case 'email_not_found':
      return "Your Google account's email isn't verified, so it can't be used to sign in. Use your email and password instead."
    default:
      return "Signing in with Google didn't work. Please try again."
  }
}

/** Password errors belong next to the password field rather than at the top. */
export function isPasswordError(error: AuthError) {
  return ['PASSWORD_COMPROMISED', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'].includes(error.code ?? '')
}
