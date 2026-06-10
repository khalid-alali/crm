import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOnce } from '@/lib/activation/events'
import { writeFactIfNull } from '@/lib/activation/facts'
import { getState } from '@/lib/activation/state'
import { sendServiceWriterSetupEmail } from '@/lib/activation/emails'

const SETUP_EMAIL_DEDUPE = 'drip:service_writer_setup_email'

export async function tryDeliverServiceWriterSetupEmailOnce(
  supabase: SupabaseClient,
  locationId: string,
): Promise<void> {
  const state = await getState(supabase, locationId)
  const to = state?.serviceWriterEmail?.trim()
  if (!state || !to) return

  await sendOnce(supabase, locationId, SETUP_EMAIL_DEDUPE, async () => {
    await sendServiceWriterSetupEmail(state)
    await writeFactIfNull(
      supabase,
      locationId,
      'service_writer_setup_email_sent_at',
      new Date().toISOString(),
    )
  }, { channel: 'email', to })
}
