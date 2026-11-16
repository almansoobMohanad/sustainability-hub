import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, authErrorMessage } from './auth-errors'
import { AuthHeading, DevInboxHint, FormMessage } from './auth-parts'

const RESEND_COOLDOWN_SECONDS = 60

/** After sign-up, or after trying to sign in with an unverified email. */
export function CheckEmailPage({ email, reason }: { email?: string; reason?: 'unverified' }) {
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Count the resend cooldown down once a second
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function resend() {
    if (!email) return
    setSending(true)
    setMessage(null)
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/email-verified' })
      if (error) setMessage({ tone: 'error', text: authErrorMessage(error) })
      else {
        setMessage({ tone: 'success', text: 'We sent a new link. Check your inbox.' })
        setCooldown(RESEND_COOLDOWN_SECONDS)
      }
    } catch {
      setMessage({ tone: 'error', text: NETWORK_ERROR_MESSAGE })
    } finally {
      setSending(false)
    }
  }

  const who = email ? <span className="font-medium text-foreground">{email}</span> : 'your email address'

  return (
    <>
      <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <AuthHeading
        title={reason === 'unverified' ? 'Verify your email first' : 'Check your inbox'}
        description={
          reason === 'unverified' ? (
            <>Your email isn&apos;t verified yet. We sent a new verification link to {who}.</>
          ) : (
            <>We sent a verification link to {who}. Click it to activate your account.</>
          )
        }
      />

      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}

      <p className="text-sm text-muted-foreground">
        The link expires in 24 hours. Can&apos;t find the email? Check your spam folder, or send it again.
      </p>

      {email ? (
        <Button
          type="button"
          variant="outline"
          className="mt-5 h-10 w-full rounded-full"
          onClick={resend}
          disabled={sending || cooldown > 0}
        >
          {sending ? 'Sending...' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the link again'}
        </Button>
      ) : null}

      <DevInboxHint />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
