import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivationActivityLogMeta = {
  channel: 'email' | 'sms'
  subject: string
  body: string
  to: string
}

const SENT_BY = 'expert-assist'

function activityBody(body: string): string {
  const trimmed = body.trim()
  return trimmed ? `${trimmed}\n\n— Expert Assist (automated)` : '— Expert Assist (automated)'
}

export async function logActivationSendActivity(
  supabase: SupabaseClient,
  locationId: string,
  meta: ActivationActivityLogMeta,
): Promise<void> {
  const { error } = await supabase.from('activity_log').insert({
    location_id: locationId,
    type: meta.channel === 'email' ? 'email' : 'note',
    subject: meta.subject.trim(),
    body: activityBody(meta.body),
    to_email: meta.to.trim(),
    sent_by: SENT_BY,
  })

  if (error) throw new Error(error.message)
}
