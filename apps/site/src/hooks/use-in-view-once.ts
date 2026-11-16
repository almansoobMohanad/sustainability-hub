import { useEffect, useRef, useState } from 'react'

/**
 * Returns a ref and `inView`, which becomes true the first time the element
 * scrolls into view and then stays true. Used for one-time entrance animations.
 *
 * - `rootMargin` shrinks/grows the trigger area, e.g. '0px 0px -15% 0px' waits
 *   until the element is 15% of the screen height above the bottom edge.
 * - If the element is already above the screen when we start watching, it
 *   counts as seen straight away. (If you jump straight past it, it triggers
 *   when you scroll back to it.)
 */
export function useInViewOnce<T extends Element>(rootMargin = '0px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, inView }
}
