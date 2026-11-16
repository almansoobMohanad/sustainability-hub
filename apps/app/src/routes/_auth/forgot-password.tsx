import { createFileRoute } from '@tanstack/react-router'
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'

export const Route = createFileRoute('/_auth/forgot-password')({
  head: () => ({ meta: [{ title: 'Reset your password · Sustainability Hub' }] }),
  component: ForgotPasswordPage,
})
