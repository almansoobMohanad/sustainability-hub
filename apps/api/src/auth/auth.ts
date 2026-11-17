import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { haveIBeenPwned } from 'better-auth/plugins'
import type { Database } from '@hub/db'
import * as schema from '@hub/db/schema'
import { sendInBackground, type Mailer } from '../email/mailer'
import {
  existingAccountMessage,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from '../email/templates'
import { CLIENT_IP_HEADER } from './client-ip'
import { deleteUnverifiedAccount } from './unverified-accounts'

/*
  Authentication (Better Auth), mounted at /api/auth/*. It stores users,
  sessions, accounts and tokens in our Postgres (tables in
  packages/db/src/schema/auth.ts). The design and its reasons are in AGENTS.md,
  section 2a. Sign-in methods: email + password, and Google (when configured).
*/

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type AuthDeps = {
  db: Database
  mailer: Mailer
  /** Where people open the app, e.g. http://localhost:5174 */
  appUrl: string
  secret: string
  checkBreachedPasswords: boolean
  /** Google OAuth client; undefined turns "Continue with Google" off. */
  google?: { clientId: string; clientSecret: string }
}

export function createAuth({ db, mailer, appUrl, secret, checkBreachedPasswords, google }: AuthDeps) {
  const pageUrl = (path: string) => new URL(path, appUrl).href

  return betterAuth({
    appName: 'Sustainability Hub',
    // The API is reached through the app's address (/api is forwarded to us), so
    // cookies belong to the app's origin and email links open the app.
    baseURL: appUrl,
    basePath: '/api/auth',
    secret,
    // Only pages served from the app's own address may call these endpoints
    // (protects against other sites submitting requests with the user's cookie).
    trustedOrigins: [appUrl],

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      usePlural: true, // tables: users, sessions, accounts, verifications, rate_limits
    }),

    emailAndPassword: {
      enabled: true,
      // No access until the email is confirmed. Also makes sign-up give the same
      // answer for new and already-registered emails (no account enumeration).
      requireEmailVerification: true,
      autoSignIn: false,
      // Length beats complexity rules; 128 caps the cost of hashing huge inputs.
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1 * HOUR,
      // A password reset signs the account out everywhere (e.g. a stolen session).
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(mailer, resetPasswordMessage(user, url))
      },
      onPasswordReset: async ({ user }) => {
        sendInBackground(mailer, passwordChangedMessage(user, pageUrl('/sign-in')))
      },
      onExistingUserSignUp: async ({ user }) => {
        sendInBackground(
          mailer,
          existingAccountMessage(user, pageUrl('/sign-in'), pageUrl('/forgot-password')),
        )
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // Signing in before verifying sends a fresh link (the old one may have expired).
      sendOnSignIn: true,
      // Clicking the link both verifies the email and signs the person in.
      autoSignInAfterVerification: true,
      expiresIn: 1 * DAY,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(mailer, verifyEmailMessage(user, url))
      },
    },

    // Sign in with Google: the server-side "authorization code" flow with PKCE
    // and a `state` check (Better Auth handles both). The browser only ever sees
    // a one-time code; the client secret stays on the server.
    // Redirect URL to register in Google Cloud Console: <APP_URL>/api/auth/callback/google
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            // Default scopes only: openid, email, profile (name, email, photo).
            // Always show Google's account chooser (people often have several).
            prompt: 'select_account',
            // We don't use Google One Tap (sign-in with a token sent by the
            // browser); turning it off removes that way in entirely.
            disableIdTokenSignIn: true,
            // Runs once Google has proven who this is, before Better Auth looks
            // for an existing account with the same email. Only used for its
            // side effect; returning {} keeps Google's name/email/photo as they are.
            mapProfileToUser: async (profile) => {
              if (profile.email_verified === true && profile.email) {
                const removed = await deleteUnverifiedAccount(db, profile.email)
                if (removed) {
                  console.info('Google sign-in: removed an unverified account with the same email (Google wins).')
                }
              }
              return {}
            },
          },
        }
      : {},

    // When a Google sign-in fails before we know where the person came from
    // (e.g. an expired or forged `state`), send them to our sign-in page, which
    // explains it (?error=state_mismatch etc.), instead of Better Auth's bare
    // built-in error page.
    onAPIError: { errorURL: pageUrl('/sign-in') },

    account: {
      accountLinking: {
        // Google + an existing account with the same email become ONE account,
        // but only when both sides proved the email: Google says email_verified
        // AND our account's email was verified. Google is deliberately NOT in
        // `trustedProviders` (that would link even without email_verified).
        // Never-verified accounts are removed first (mapProfileToUser above).
        enabled: true,
        trustedProviders: [],
      },
    },

    session: {
      expiresIn: 7 * DAY,
      // Each day of activity pushes the expiry out again ("sliding" session).
      updateAge: 1 * DAY,
    },

    rateLimit: {
      // Better Auth only rate limits in production by default; on everywhere so
      // development behaves the same (and it can be tested).
      enabled: true,
      storage: 'database', // shared by every API instance, survives restarts
      window: 1 * MINUTE,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 1 * MINUTE, max: 5 },
        '/sign-up/email': { window: 1 * MINUTE, max: 3 },
        '/request-password-reset': { window: 15 * MINUTE, max: 3 },
        '/send-verification-email': { window: 15 * MINUTE, max: 3 },
        '/reset-password': { window: 15 * MINUTE, max: 5 },
      },
    },

    advanced: {
      // UUID primary keys, generated by Postgres
      database: { generateId: 'uuid' },
      // The client IP (for rate limits) comes ONLY from a header our own
      // middleware sets, never from headers a client could fake. See client-ip.ts.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      cookiePrefix: 'hub',
    },

    telemetry: { enabled: false },

    plugins: [
      // Rejects passwords that appear in known data breaches. Only the first 5
      // characters of the password's SHA-1 hash leave the server (k-anonymity).
      haveIBeenPwned({
        enabled: checkBreachedPasswords,
        customPasswordCompromisedMessage:
          'This password has appeared in a data breach, so it is not safe to use. Choose a different one.',
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
