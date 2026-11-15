import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { FeaturesSection } from './FeaturesSection'
import { LeafVisual } from './LeafVisual'
import { SectionDivider } from './SectionDivider'

// The header and footer come from the shared layout in src/routes/__root.tsx.
export function LandingPage() {
  return (
    <>
      {/* Hero: fills the screen below the 4rem (h-16) sticky header */}
      <section>
        {/*
          - items-start + pt-*: text starts a fixed distance below the header
            (instead of being vertically centred in the full-height section).
          - lg:grid-cols-[3fr_2fr]: text column gets 60% of the width, the
            visual 40%, so the headline has room for longer lines.
        */}
        <div className="grid min-h-[calc(100svh-4rem)] items-start gap-12 px-page pt-20 pb-16 lg:grid-cols-[3fr_2fr] lg:pt-36">
          {/* Left: text. px-page (same as the header) keeps it lined up with the logo */}
          <div>
            {/* text-pretty: fill each line, but avoid leaving one word alone on the last line */}
            <h1 className="text-shimmer font-heading text-4xl font-semibold tracking-tight text-pretty sm:text-5xl lg:text-[4rem]">
              {/* &nbsp; keeps "one place" together so "place" never sits alone on a line */}
              Track, verify and report your emissions in one&nbsp;place
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              Sustainability Hub helps companies measure their carbon
              footprint, verify the data behind it and turn it into
              disclosure-ready reports.
            </p>
            <div className="mt-14 flex flex-col gap-3 sm:flex-row">
              {/*
                Pill-shaped and a bit larger than the default "lg" size:
                h-11 = 44px tall, rounded-full = fully rounded ends.
              */}
              {/* /signup will be the registration page once auth is built */}
              <Button
                size="lg"
                className="h-11 rounded-full px-6 text-base has-data-[icon=inline-end]:pr-5"
                asChild
              >
                <a href="/signup">
                  Get started
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-full px-6 text-base"
                asChild
              >
                <Link to="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>

          {/*
            Right: animated leaf (see LeafVisual.tsx).
            Hidden on small screens so the text gets the full width.
          */}
          <div className="hidden items-center justify-center self-center lg:flex">
            <LeafVisual />
          </div>
        </div>
      </section>

      {/* Soft green "horizon" line between the hero and the features */}
      <SectionDivider />

      {/* Features (scroll-driven, see FeaturesSection.tsx) */}
      <FeaturesSection />
    </>
  )
}
