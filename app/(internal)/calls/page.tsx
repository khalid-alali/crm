import { supabaseAdmin } from '@/lib/supabase'
import { formatCallDuration, isCrmVisibleCall } from '@/lib/dialpad'
import { resolveDialpadContactNames } from '@/lib/dialpad-contact-lookup'
import { getAppSession } from '@/lib/app-auth'
import { canAccessCallQueue } from '@/lib/calls-access'
import { phoneMatchKey } from '@/lib/phone'
import { notFound } from 'next/navigation'
import CallQueueClient, { type QueuedCall } from './CallQueueClient'

export const dynamic = 'force-dynamic'

export default async function CallQueuePage() {
  const session = await getAppSession()
  if (!canAccessCallQueue(session?.user?.email)) notFound()
  const { data: rows } = await supabaseAdmin
    .from('shop_call_activity')
    .select(
      'call_id, direction, rw_user_name, external_number, started_at, total_sec, connected_at, summary, dialpad_contact_name',
    )
    .eq('in_queue', true)
    .order('started_at', { ascending: false })
    .limit(200)

  const visible = (rows ?? []).filter(isCrmVisibleCall)

  const numbersNeedingLookup = [
    ...new Set(
      visible
        .filter(r => !r.dialpad_contact_name?.trim())
        .map(r => r.external_number)
        .filter((n): n is string => Boolean(n)),
    ),
  ]

  let dialpadNames = new Map<string, string>()
  if (numbersNeedingLookup.length > 0) {
    try {
      dialpadNames = await resolveDialpadContactNames(numbersNeedingLookup)
    } catch (e) {
      console.error('[calls queue] Dialpad contact lookup failed', e)
    }
  }

  const calls: QueuedCall[] = visible.map(r => {
    const key = phoneMatchKey(r.external_number)
    const dialpadContactName =
      r.dialpad_contact_name?.trim() || (key ? dialpadNames.get(key) : null) || null
    return {
      callId: r.call_id,
      direction: r.direction,
      rwUserName: r.rw_user_name,
      externalNumber: r.external_number,
      dialpadContactName,
      startedAt: r.started_at,
      duration: formatCallDuration(r.total_sec),
      summary: r.summary,
    }
  })

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-onix-950">Call match queue</h1>
        <p className="mt-1 text-sm text-onix-500">
          Calls we couldn&apos;t auto-match to a shop. Assign one to attach it to the right record (and
          teach the system that number), or dismiss it if it isn&apos;t a shop.
        </p>
      </header>
      <CallQueueClient initialCalls={calls} />
    </div>
  )
}
