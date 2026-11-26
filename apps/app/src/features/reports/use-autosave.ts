import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/lib/api'

/*
  Autosave for the reports (SEDG, ESG Ready). Each change waits in a queue;
  1.5 seconds after the last one (or when a field loses focus) the queue goes
  to the API in ONE request with only the changed fields. So typing a long
  answer is one save, not one per key: light on the database, and nothing is
  lost if the page closes (a last save is sent with `keepalive`, which the
  browser finishes on its own).

  One save at a time: changes made while a save is running go in the next one.
  A failed save keeps its changes queued (newer ones win) and says so; the next
  change, a blur or "Retry" tries again.

  Besides answers (field key -> value, null = remove), a report can have other
  settings saved right away (SEDG's level): `changeSetting`.
*/

const DELAY_MS = 1500

export type SaveStatus = { state: 'saved' } | { state: 'waiting' } | { state: 'saving' } | { state: 'failed'; message: string }

export type ReportChanges<V> = { answers?: Record<string, V | null> } & Record<string, unknown>

type Options<V, S> = {
  /** Sends the changes; `keepalive` when the page is being left (no answer expected) */
  save: (changes: ReportChanges<V>, options?: { keepalive?: boolean }) => Promise<S | undefined>
  /** Puts the changes into the cached report (`saved` = the API's answer, missing when leaving the page) */
  apply: (changes: ReportChanges<V>, saved?: S) => void
}

export function useAutosave<V, S>({ save, apply }: Options<V, S>) {
  const answers = useRef<Record<string, V | null>>({})
  const settings = useRef<Record<string, unknown>>({})
  const timer = useRef<number | undefined>(undefined)
  const running = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<SaveStatus>({ state: 'saved' })
  // The latest save/apply (they may change between renders) and flush (timers call it later)
  const callbacks = useRef({ save, apply })
  const flushRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    callbacks.current = { save, apply }
  }, [save, apply])

  // Helpers on the queue (refs only, so they never change)
  const later = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flushRef.current(), DELAY_MS)
  }, [])
  const hasQueued = useCallback(
    () => Object.keys(answers.current).length > 0 || Object.keys(settings.current).length > 0,
    [],
  )
  const takeQueued = useCallback((): ReportChanges<V> => {
    const changes: ReportChanges<V> = { ...settings.current }
    if (Object.keys(answers.current).length > 0) changes.answers = answers.current
    answers.current = {}
    settings.current = {}
    return changes
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    // One save at a time: wait for the running one; what's queued goes next
    while (running.current) await running.current
    if (!hasQueued()) return
    const changes = takeQueued()
    setStatus({ state: 'saving' })
    running.current = (async () => {
      try {
        const saved = await callbacks.current.save(changes)
        callbacks.current.apply(changes, saved)
        setStatus(hasQueued() ? { state: 'waiting' } : { state: 'saved' })
      } catch (error) {
        // Put the changes back, unless something newer was entered meanwhile
        const { answers: failed, ...failedSettings } = changes
        answers.current = { ...failed, ...answers.current }
        settings.current = { ...failedSettings, ...settings.current }
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
  }, [hasQueued, later, takeQueued])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  /** An answer changed: `null` removes the stored value */
  const change = useCallback((key: string, value: V | null) => {
    answers.current[key] = value
    setStatus((current) => (current.state === 'saving' ? current : { state: 'waiting' }))
    later()
  }, [later])

  /** The field now holds something invalid: don't save an earlier value entered into it */
  const discard = useCallback((key: string) => {
    delete answers.current[key]
    if (!hasQueued()) setStatus((current) => (current.state === 'waiting' ? { state: 'saved' } : current))
  }, [hasQueued])

  /** A setting chosen with one click (e.g. SEDG's level): saved right away, with anything else queued */
  const changeSetting = useCallback(
    (name: string, value: unknown) => {
      settings.current[name] = value
      void flush()
    },
    [flush],
  )

  // Leaving the page (or the year), or closing the tab: send what's queued, finished by the browser
  useEffect(() => {
    const sendQueued = () => {
      window.clearTimeout(timer.current)
      if (!hasQueued()) return
      const changes = takeQueued()
      void callbacks.current.save(changes, { keepalive: true })
      callbacks.current.apply(changes)
    }
    window.addEventListener('pagehide', sendQueued)
    return () => {
      window.removeEventListener('pagehide', sendQueued)
      sendQueued()
    }
  }, [hasQueued, takeQueued])

  return { status, change, discard, changeSetting, flush }
}

export type Autosave<V> = Pick<ReturnType<typeof useAutosave<V, unknown>>, 'change' | 'discard' | 'flush'>
