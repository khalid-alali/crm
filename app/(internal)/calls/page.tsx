import { supabaseAdmin } from '@/lib/supabase'
import { formatCallDuration, isCrmVisibleCall } from '@/lib/dialpad'
import CallQueueClient, { type QueuedCall } from './CallQueueClient'

export const dynamic = 'force-dynamic'

export default async function CallQueuePage() {
  const { data: rows } = await supabaseAdmin
    .from('shop_call_activity')
    .select('call_id, direction, rw_user_name, external_number, started_at, total_sec, connected_at, summary')
    .eq('in_queue', true)
    .order('started_at', { ascending: false })
    .limit(200)

  const calls: QueuedCall[] = (rows ?? []).filter(isCrmVisibleCall).map(r => ({
    callId: r.call_id,
    direction: r.direction,
    rwUserName: r.rw_user_name,
    externalNumber: r.external_number,
    startedAt: r.started_at,
    duration: formatCallDuration(r.total_sec),
    summary: r.summary,
  }))

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
