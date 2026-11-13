import { useState } from 'react'
import { Leaf } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Temporary page to confirm Tailwind + shadcn/ui + the @ alias work.
// It gets replaced by the real router/layout once development starts.
function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground">
      <div className="flex items-center gap-3">
        <Leaf className="size-8 text-emerald-600" aria-hidden />
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Sustainability Hub
        </h1>
      </div>
      <p className="max-w-md text-center text-muted-foreground">
        Tailwind CSS and shadcn/ui are working. Click the buttons to check
        that React state and component variants render correctly.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</Button>
        <Button variant="outline" onClick={() => setCount(0)}>
          Reset
        </Button>
      </div>
    </main>
  )
}

export default App
