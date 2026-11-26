import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SedgLevel, SedgValue } from '@hub/shared/sedg'
import { errorMessage } from '@/lib/api'
import { applyChanges, refreshFigures, saveSedgChanges, type SedgChanges } from './queries'

/*
  Autosave for the SEDG report. Each change waits in a queue; 1.5 seconds after
  the last one (or when the field loses focus) the queue goes to the API in ONE
  request with only the changed fields. So typing a long answer is one save,
  not one per key: light on the database, and nothing is lost if the page closes
  (a last save is sent with `keepalive`, which the browser finishes on its own).

  One save at a time: changes made while a save is running go in the next one.
  A failed save keeps its changes queued (newer ones win) and says so; the next
  change, a blur or "Retry" tries again.
*/

const DELAY_MS = 1500
// Saving these changes other figures (the intensity, E1.7): fetch the figures again afterwards
const FIGURE_INPUTS = new Set(['gen_revenue', 'e1_1', 'e1_2'])

export type SaveStatus = { state: 'saved' } | { state: 'waiting' } | { state: 'saving' } | { state: 'failed'; message: string }

export function useAutosave(companyId: string, year: number) {
  const queryClient = useQueryClient()
  const queue = useRef<Record<string, SedgValue | null>>({})
  const queuedLevel = useRef<SedgLevel | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const running = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<SaveStatus>({ state: 'saved' })
  // flush schedules itself again (timers, a save that was still running): always the latest version
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const later = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flushRef.current(), DELAY_MS)
  }

  const hasQueued = () => Object.keys(queue.current).length > 0 || queuedLevel.current !== null

  const takeQueued = (): SedgChanges => {
    const changes: SedgChanges = {}
    if (Object.keys(queue.current).length > 0) changes.answers = queue.current
    if (queuedLevel.current) changes.level = queuedLevel.current
    queue.current = {}
    queuedLevel.current = null
    return changes
  }

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    // One save at a time: wait for the running one; what's queued goes next
    while (running.current) await running.current
    if (!hasQueued()) return
    const changes = takeQueued()
    setStatus({ state: 'saving' })
    running.current = (async () => {
      try {
        const saved = await saveSedgChanges(year, changes)
        if (!saved) return
        applyChanges(queryClient, companyId, year, changes, saved)
        if (Object.keys(changes.answers ?? {}).some((key) => FIGURE_INPUTS.has(key))) {
          void refreshFigures(queryClient, companyId, year)
        }
        setStatus(hasQueued() ? { state: 'waiting' } : { state: 'saved' })
      } catch (error) {
        // Put the changes back, unless something newer was typed for the same field meanwhile
        queue.current = { ...changes.answers, ...queue.current }
        queuedLevel.current ??= changes.level ?? null
        setStatus({ state: 'failed', message: errorMessage(error) })
      }
    })()
    try {
      await running.current
    } finally {
      running.current = null
    }
    // More changes arrived during the save: they get their own delay
    if (hasQueued()) later()
  }, [companyId, queryClient, year])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  /** A field changed: `null` removes the stored value (a calculated figure shows again) */
  const change = useCallback(
    (key: string, value: SedgValue | null) => {
      queue.current[key] = value
      setStatus((current) => (current.state === 'saving' ? current : { state: 'waiting' }))
      later()
    },
    [],
  )

  /** The field now holds something invalid: don't save an earlier value typed into it */
  const discard = useCallback((key: string) => {
    delete queue.current[key]
    if (!hasQueued()) setStatus((current) => (current.state === 'waiting' ? { state: 'saved' } : current))
  }, [])

  /** The level is one click, so it's saved right away (with anything else queued) */
  const changeLevel = useCallback(
    (level: SedgLevel) => {
      queuedLevel.current = level
      void flush()
    },
    [flush],
  )

  // Leaving the page or the year (or closing the tab): send what's queued, finished by the browser
  useEffect(() => {
    const sendQueued = () => {
      window.clearTimeout(timer.current)
      if (!hasQueued()) return
      const changes = takeQueued()
      void saveSedgChanges(year, changes, { keepalive: true })
      applyChanges(queryClient, companyId, year, changes)
    }
    window.addEventListener('pagehide', sendQueued)
    return () => {
      window.removeEventListener('pagehide', sendQueued)
      sendQueued()
    }
  }, [companyId, queryClient, year])

  return { status, change, discard, changeLevel, flush }
}
