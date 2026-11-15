import { LandingPage } from '@/features/landing/LandingPage'

// Until routing is set up, the app only renders the landing page.
// With TanStack Router, LandingPage becomes the "/" route.
function App() {
  return <LandingPage />
}

export default App
