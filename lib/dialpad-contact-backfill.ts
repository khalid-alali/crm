import { supabaseAdmin } from '@/lib/supabase'
import { phoneMatchKey } from '@/lib/phone'
import { clearDialpadContactCache, resolveDialpadContactNames } from '@/lib/dialpad-contact-lookup'

export type DialpadContactNameBackfillOptions = {
  apply: boolean
  days: number | null
}

export type DialpadContactNameBackfillSummary = {
  apply: boolean
  days: number | null
  rowsWithoutName: number
  uniqueNumbers: number
  namesResolved: number
  rowsUpdated: number
  errors: string[]
}

export async function runDialpadContactNameBackfill(
  opts: DialpadContactNameBackfillOptions,
): Promise<DialpadContactNameBackfillSummary> {
  const summary: DialpadContactNameBackfillSummary = {
    apply: opts.apply,
    days: opts.days,
    rowsWithoutName: 0,
    uniqueNumbers: 0,
    namesResolved: 0,
    rowsUpdated: 0,
    errors: [],
  }

  let query = supabaseAdmin
    .from('shop_call_activity')
    .select('call_id, external_number')
    .is('dialpad_contact_name', null)
    .not('external_number', 'is', null)

  if (opts.days != null) {
    const startedAfter = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('started_at', startedAfter)
  }

  const { data: rows, error } = await query
  if (error) throw error

  summary.rowsWithoutName = rows?.length ?? 0
  if (!rows?.length) return summary

  const externalNumbers = [
    ...new Set(rows.map(r => r.external_number).filter((n): n is string => Boolean(n))),
  ]
  summary.uniqueNumbers = externalNumbers.length

  clearDialpadContactCache()
  const namesByKey = await resolveDialpadContactNames(externalNumbers)
  summary.namesResolved = namesByKey.size

  const nameByExternalNumber = new Map<string, string>()
  for (const number of externalNumbers) {
    const key = phoneMatchKey(number)
    const name = key ? namesByKey.get(key) : null
    if (name) nameByExternalNumber.set(number, name)
  }

  if (!opts.apply) {
    summary.rowsUpdated = rows.filter(r =>
      r.external_number ? nameByExternalNumber.has(r.external_number) : false,
    ).length
    return summary
  }

  for (const [externalNumber, name] of nameByExternalNumber) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('shop_call_activity')
      .update({ dialpad_contact_name: name })
      .eq('external_number', externalNumber)
      .is('dialpad_contact_name', null)
      .select('call_id')

    if (updateError) {
      summary.errors.push(`${externalNumber}: ${updateError.message}`)
      continue
    }
    summary.rowsUpdated += updated?.length ?? 0
  }

  return summary
}
