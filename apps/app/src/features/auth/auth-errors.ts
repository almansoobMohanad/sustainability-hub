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

/** Password errors belong next to the password field rather than at the top. */
export function isPasswordError(error: AuthError) {
  return ['PASSWORD_COMPROMISED', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'].includes(error.code ?? '')
}
