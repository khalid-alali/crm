import { logger, schedules } from '@trigger.dev/sdk'
import { reconcileDialpadSubscriptions } from '@/lib/dialpad-reconcile'

/**
 * Keeps Dialpad call-event subscriptions in sync with the technicians-department
 * roster (P0-5): one subscription per current member against our webhook. New
 * hires gain one, departures lose theirs — no per-hire engineering.
 *
 * Runs daily at 13:00 UTC. Also triggerable on demand from the Trigger.dev
 * dashboard for an immediate reconcile after a roster change.
 */
export const reconcileDialpadSubscriptionsTask = schedules.task({
  id: 'dialpad-reconcile-subscriptions',
  cron: '0 13 * * *',
  run: async () => {
    const summary = await reconcileDialpadSubscriptions({ apply: true })
    logger.log('Dialpad subscriptions reconciled', {
      members: summary.memberCount,
      created: summary.created.length,
      deleted: summary.deleted.length,
      unchanged: summary.unchanged,
      errors: summary.errors,
    })
    if (summary.errors.length) {
      // Surface partial failures as a task failure so they're visible/retried.
      throw new Error(`Reconcile completed with ${summary.errors.length} error(s): ${summary.errors.join('; ')}`)
    }
    return summary
  },
})
