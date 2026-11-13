import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/landing/LandingPage'

// "/" -> the landing page
export const Route = createFileRoute('/')({
  component: LandingPage,
})
