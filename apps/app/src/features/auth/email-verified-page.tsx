import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { AuthHeading } from './auth-parts'
import { forgetSession } from './session'

/*
  Where the verification link lands. The API has already checked the link:
  if it was valid, the email is verified and the person is signed in; if not,
  we get ?error=TOKEN_EXPIRED or ?error=INVALID_TOKEN.
*/
export function EmailVerifiedPage({ error }: { error?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (error) {
    const expired = error === 'TOKEN_EXPIRED'
    return (
      <>
        <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <AuthHeading
          title={expired ? 'This link has expired' : "This link isn't valid"}
          description="Sign in with your email and password, and we'll send you a new verification link."
        />
        <Button asChild className="h-10 w-full rounded-full">
          <Link to="/sign-in">Go to sign in</Link>
        </Button>
      </>
    )
  }

  async function continueToApp() {
    // The verification signed us in: drop any cached "signed out" answer first
    forgetSession(queryClient)
    await navigate({ to: '/' })
  }

  return (
    <>
      <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <CircleCheck className="size-5" aria-hidden />
      </span>
      <AuthHeading title="Email verified" description="Thanks for confirming your email. Your account is ready." />
      <Button className="h-10 w-full rounded-full" onClick={continueToApp}>
        Continue to the dashboard
      </Button>
    </>
  )
}
