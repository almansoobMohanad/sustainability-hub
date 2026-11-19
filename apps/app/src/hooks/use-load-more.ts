import { useEffect, useRef } from 'react'

/*
  Lazy loading for long lists: put the returned ref on an element at the end
  of the list; when it comes within `margin` of the visible area (the page, or
  `root` if the list scrolls inside a box), `loadMore` runs. Pair it with a
  visible "Load more" button for keyboard and screen-reader users.
*/
export function useLoadMore({
  hasMore,
  loading,
  loadMore,
  root = null,
  margin = '300px',
}: {
  hasMore: boolean
  loading: boolean
  loadMore: () => void
  root?: Element | null
  margin?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = endRef.current
    if (!target || !hasMore || loading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { root, rootMargin: margin })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore, root, margin])
  return endRef
}
