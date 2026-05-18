'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { queueDataSignature } from '@/lib/expert-assist/queue-snapshot'
import type { ConsultQueueRow } from '@/lib/expert-assist/types'

const POLL_MS = 12_000

type QueuePayload = {
  pending: ConsultQueueRow[]
  open: ConsultQueueRow[]
}

export function useConsultQueuePoll(
  initialPending: ConsultQueueRow[],
  initialOpen: ConsultQueueRow[]
) {
  const [pending, setPending] = useState(initialPending)
  const [open, setOpen] = useState(initialOpen)
  const [lastUpdated, setLastUpdated] = useState(() => new Date())
  const [syncing, setSyncing] = useState(false)
  const dataRef = useRef<QueuePayload>({ pending: initialPending, open: initialOpen })
  const sigRef = useRef(queueDataSignature(initialPending, initialOpen))

  const applyServerProps = useCallback((nextPending: ConsultQueueRow[], nextOpen: ConsultQueueRow[]) => {
    const sig = queueDataSignature(nextPending, nextOpen)
    if (sig === sigRef.current) return
    sigRef.current = sig
    dataRef.current = { pending: nextPending, open: nextOpen }
    setPending(nextPending)
    setOpen(nextOpen)
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    applyServerProps(initialPending, initialOpen)
  }, [initialPending, initialOpen, applyServerProps])

  useEffect(() => {
    let cancelled = false
    let timerId: number | null = null

    async function poll() {
      if (document.visibilityState === 'hidden') return

      setSyncing(true)
      try {
        const res = await fetch('/api/consults/queue', { cache: 'no-store' })
        if (!res.ok || cancelled) return

        const data = (await res.json()) as QueuePayload
        if (cancelled) return

        const nextSig = queueDataSignature(data.pending, data.open)
        if (nextSig !== sigRef.current) {
          sigRef.current = nextSig
          dataRef.current = { pending: data.pending, open: data.open }
          setPending(data.pending)
          setOpen(data.open)
        }
        setLastUpdated(new Date())
      } catch {
        /* keep last good snapshot */
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }

    function startInterval() {
      if (timerId !== null) window.clearInterval(timerId)
      timerId = window.setInterval(poll, POLL_MS)
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void poll()
        startInterval()
      } else if (timerId !== null) {
        window.clearInterval(timerId)
        timerId = null
      }
    }

    void poll()
    startInterval()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (timerId !== null) window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return { pending, open, lastUpdated, syncing }
}
