/*
  Messages for Better Auth's organization errors. The API enforces every rule;
  these only explain a refusal in plain words.
*/

type ApiError = { status: number; code?: string; message?: string }

const MESSAGES: Record<string, string> = {
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    'A company needs at least one Admin. Make someone else an Admin first.',
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
    'A company needs at least one Admin. Make someone else an Admin first.',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'This person is already a member of the company.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'This email already has a pending invitation.',
  INVITATION_LIMIT_REACHED: 'This company has too many pending invitations. Cancel some first.',
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: 'This company has reached its member limit.',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: "You've reached the maximum number of companies.",
  INVITATION_NOT_FOUND: 'This invitation is no longer valid. It may have expired, been cancelled or already been used.',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: 'This invitation was sent to a different email address.',
  ORGANIZATION_SLUG_ALREADY_TAKEN: 'Something went wrong creating the company. Please try again.',
}

export function companyErrorMessage(error: ApiError) {
  if (error.status === 429) return 'Too many attempts. Please wait a while and try again.'
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
  if (error.status === 401 || error.status === 403) return "You don't have permission to do that."
  return 'Something went wrong. Please try again.'
}
