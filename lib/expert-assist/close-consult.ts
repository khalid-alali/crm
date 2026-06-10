import { revalidatePath } from 'next/cache'
import { triggerConsultCompleted } from '@/lib/activation/trigger'
import { computeChargeAmountCents, chargeConsultOffSession, billableSecondsToCharge } from '@/lib/expert-assist/billing-charge'
import { computeConsultBillUsd } from '@/lib/expert-assist/billing'
import { assertShopCanRunConsults } from '@/lib/expert-assist/billing-gates'
import { sendConsultReceiptEmail, sendConsultBillingFailureEmail } from '@/lib/expert-assist/email'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { isFirstFreeConsultAvailable, markFirstFreeConsultUsed } from '@/lib/expert-assist/free-consult'
import { sendConsultSms } from '@/lib/expert-assist/send-sms'
import { supabaseAdmin } from '@/lib/supabase'

export type CloseConsultSource = 'expert' | 'cron'

const COMPLIMENTARY_AMOUNT_LABEL = '$0.00'

export async function closeConsultCaseWithBilling(params: {
  caseId: string
  expertEmail?: string | null
  billableSecondsOverride?: number | null
  source: CloseConsultSource
}): Promise<
  | { ok: true; amountLabel: string; amountCents: number }
  | { ok: false; error: string; billingFailed?: boolean }
> {
  const { data: caseRow, error: loadErr } = await supabaseAdmin
    .from('consult_cases')
    .select(
      'id, shop_id, originating_phone_number, outcome, billable_seconds, status'
    )
    .eq('id', params.caseId)
    .maybeSingle()

  if (loadErr || !caseRow) return { ok: false, error: loadErr?.message ?? 'Case not found' }

  const cr = caseRow as {
    id: string
    shop_id: string | null
    originating_phone_number: string
    outcome: string | null
    billable_seconds: number | null
    status: string
  }

  if (cr.status !== 'open') return { ok: false, error: 'Case is not open' }
  if (!cr.outcome) return { ok: false, error: 'Set an outcome before closing' }
  if (!cr.shop_id) return { ok: false, error: 'Case has no shop' }

  const gate = await assertShopCanRunConsults(cr.shop_id)
  if (!gate.ok) return { ok: false, error: gate.reason }

  const { data: loc } = await supabaseAdmin
    .from('locations')
    .select(
      'id, name, consult_billing_email, consult_stripe_customer_id, consult_stripe_payment_method_id, consult_first_free_used_at',
    )
    .eq('id', cr.shop_id)
    .maybeSingle()

  if (!loc) return { ok: false, error: 'Shop not found' }

  const shopName = (loc as { name: string }).name
  const billEmail = (loc as { consult_billing_email: string | null }).consult_billing_email
  const actorType = params.source === 'cron' ? 'system' : 'expert'

  if (isFirstFreeConsultAvailable(loc as { consult_first_free_used_at: string | null })) {
    const closedAt = new Date().toISOString()
    const claimed = await markFirstFreeConsultUsed({
      supabase: supabaseAdmin,
      locationId: cr.shop_id,
      usedAt: closedAt,
      actorEmail: params.expertEmail,
    })

    if (claimed) {
      await supabaseAdmin
        .from('consult_cases')
        .update({
          status: 'closed',
          payment_status: 'succeeded',
          billed_amount_cents: 0,
          stripe_charge_id: null,
          closed_at: closedAt,
          is_complimentary: true,
        })
        .eq('id', params.caseId)

      await insertConsultCaseEvent({
        caseId: params.caseId,
        eventType: 'charged',
        actorType,
        actorId: params.expertEmail ?? null,
        metadata: { amount_cents: 0, complimentary: true },
      })
      await insertConsultCaseEvent({
        caseId: params.caseId,
        eventType: 'closed',
        actorType,
        actorId: params.expertEmail ?? null,
        metadata: { complimentary: true },
      })

      try {
        await sendConsultSms({
          to: cr.originating_phone_number,
          body: `Consult closed. Your first Expert Assist consult was complimentary — no charge.`,
          caseId: params.caseId,
          logDirection: 'system',
        })
      } catch (e) {
        console.error('closeConsultCaseWithBilling complimentary SMS', e)
      }

      revalidatePath('/consults')
      revalidatePath(`/consults/${params.caseId}`)

      try {
        await triggerConsultCompleted({
          locationId: cr.shop_id,
          consultId: params.caseId,
          closedAt,
          amountLabel: COMPLIMENTARY_AMOUNT_LABEL,
          amountCents: 0,
          paid: false,
        })
      } catch (triggerError) {
        console.error('closeConsultCaseWithBilling: consult-completed trigger failed', triggerError)
      }

      return { ok: true, amountLabel: COMPLIMENTARY_AMOUNT_LABEL, amountCents: 0 }
    }
  }

  const secs = billableSecondsToCharge(cr.billable_seconds, params.billableSecondsOverride)
  const amountCents = computeChargeAmountCents(secs)
  const amountLabel = computeConsultBillUsd(secs).label

  const customerId = (loc as { consult_stripe_customer_id: string | null }).consult_stripe_customer_id
  const pmId = (loc as { consult_stripe_payment_method_id: string | null }).consult_stripe_payment_method_id
  if (!customerId?.trim() || !pmId?.trim()) return { ok: false, error: 'Stripe billing not configured for shop' }

  await supabaseAdmin.from('consult_cases').update({ payment_status: 'processing' }).eq('id', params.caseId)

  const charge = await chargeConsultOffSession({
    customerId,
    paymentMethodId: pmId,
    amountCents,
    caseId: params.caseId,
    idempotencyKey: `consult_close_${params.caseId}`,
  })

  if ('error' in charge) {
    await supabaseAdmin
      .from('consult_cases')
      .update({
        status: 'billing_failed',
        payment_status: 'failed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', params.caseId)

    await supabaseAdmin.from('locations').update({ consult_billing_status: 'payment_failed' }).eq('id', cr.shop_id)

    await insertConsultCaseEvent({
      caseId: params.caseId,
      eventType: 'charge_failed',
      actorType,
      actorId: params.expertEmail ?? null,
      metadata: { error: charge.error },
    })

    const billTo = billEmail?.trim()
    if (billTo) {
      await sendConsultBillingFailureEmail({
        to: billTo,
        shopName,
        errorSummary: charge.error,
      })
    }

    revalidatePath('/consults')
    revalidatePath(`/consults/${params.caseId}`)
    return { ok: false, error: charge.error, billingFailed: true }
  }

  const closedAt = new Date().toISOString()
  await supabaseAdmin
    .from('consult_cases')
    .update({
      status: 'closed',
      payment_status: 'succeeded',
      billed_amount_cents: amountCents,
      stripe_charge_id: charge.paymentIntentId,
      closed_at: closedAt,
      is_complimentary: false,
    })
    .eq('id', params.caseId)

  await insertConsultCaseEvent({
    caseId: params.caseId,
    eventType: 'charged',
    actorType,
    actorId: params.expertEmail ?? null,
    metadata: { amount_cents: amountCents, payment_intent: charge.paymentIntentId },
  })
  await insertConsultCaseEvent({
    caseId: params.caseId,
    eventType: 'closed',
    actorType,
    actorId: params.expertEmail ?? null,
    metadata: {},
  })

  const billTo = billEmail?.trim()
  if (billTo) {
    await sendConsultReceiptEmail({
      to: billTo,
      shopName,
      amountLabel,
      caseId: params.caseId,
    })
  }

  const receiptHint = billTo ?? 'your billing email'

  try {
    await sendConsultSms({
      to: cr.originating_phone_number,
      body: `Consult closed. Billed ${amountLabel} to card on file. Receipt sent to ${receiptHint}.`,
      caseId: params.caseId,
      logDirection: 'system',
    })
  } catch (e) {
    console.error('closeConsultCaseWithBilling follow-up SMS', e)
  }

  revalidatePath('/consults')
  revalidatePath(`/consults/${params.caseId}`)

  try {
    await triggerConsultCompleted({
      locationId: cr.shop_id,
      consultId: params.caseId,
      closedAt,
      amountLabel,
      amountCents,
      paid: true,
    })
  } catch (triggerError) {
    console.error('closeConsultCaseWithBilling: consult-completed trigger failed', triggerError)
  }

  return { ok: true, amountLabel, amountCents }
}
