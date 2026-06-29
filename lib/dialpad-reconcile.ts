/**
 * Subscription reconciliation (P0-5). Ensures exactly one active call-event
 * subscription per current technicians-department member, against our webhook.
 * New members gain a subscription; departed members' subscriptions are removed.
 * Self-maintaining as the roster changes — no per-hire engineering.
 *
 * Driven by env:
 *   DIALPAD_WEBHOOK_ID                 — the webhook subscriptions point at
 *   DIALPAD_TECHNICIANS_DEPARTMENT_ID  — the department whose members are in scope
 */
import {
  listDepartmentUsers,
  listCallEventSubscriptions,
  createCallEventSubscription,
  deleteCallEventSubscription,
} from '@/lib/dialpad-api'

export type ReconcileSummary = {
  apply: boolean
  webhookId: string
  departmentId: string
  memberCount: number
  created: { userId: string; name: string | null }[]
  deleted: { subscriptionId: string; userId: string }[]
  unchanged: number
  errors: string[]
}

export async function reconcileDialpadSubscriptions(opts: { apply: boolean }): Promise<ReconcileSummary> {
  const webhookId = process.env.DIALPAD_WEBHOOK_ID
  const departmentId = process.env.DIALPAD_TECHNICIANS_DEPARTMENT_ID
  if (!webhookId) throw new Error('DIALPAD_WEBHOOK_ID is not set')
  if (!departmentId) throw new Error('DIALPAD_TECHNICIANS_DEPARTMENT_ID is not set')

  const summary: ReconcileSummary = {
    apply: opts.apply,
    webhookId,
    departmentId,
    memberCount: 0,
    created: [],
    deleted: [],
    unchanged: 0,
    errors: [],
  }

  const members = await listDepartmentUsers(departmentId)
  summary.memberCount = members.length
  const memberById = new Map(members.map(m => [m.id, m]))

  // Existing subscriptions for OUR webhook only — leave other webhooks alone.
  const allSubs = await listCallEventSubscriptions()
  const ourSubs = allSubs.filter(
    s => String(s.webhook?.id) === webhookId && s.target_type === 'user' && s.target_id != null,
  )

  // A user may (erroneously) have more than one sub — keep the first, prune the rest.
  const subByUser = new Map<string, string>()
  const duplicateSubs: { subscriptionId: string; userId: string }[] = []
  for (const s of ourSubs) {
    const userId = String(s.target_id)
    if (subByUser.has(userId)) {
      duplicateSubs.push({ subscriptionId: String(s.id), userId })
    } else {
      subByUser.set(userId, String(s.id))
    }
  }

  const toCreate = members.filter(m => !subByUser.has(m.id))
  const toDelete: { subscriptionId: string; userId: string }[] = [...duplicateSubs]
  for (const [userId, subscriptionId] of subByUser) {
    if (!memberById.has(userId)) toDelete.push({ subscriptionId, userId })
  }
  summary.unchanged = members.length - toCreate.length

  for (const m of toCreate) {
    try {
      if (opts.apply) await createCallEventSubscription({ webhookId, targetId: m.id })
      summary.created.push({ userId: m.id, name: m.name })
    } catch (e) {
      summary.errors.push(`create ${m.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const d of toDelete) {
    try {
      if (opts.apply) await deleteCallEventSubscription(d.subscriptionId)
      summary.deleted.push(d)
    } catch (e) {
      summary.errors.push(`delete ${d.subscriptionId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return summary
}
