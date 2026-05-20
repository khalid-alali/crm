import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import Stripe from 'stripe'
import { getStripe } from '@/lib/expert-assist/billing-charge'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 })

  const raw = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object as Stripe.SetupIntent
      const locationId = si.metadata?.location_id?.trim()
      const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
      const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id
      if (locationId && pmId && customerId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: pmId },
        })
        const pm = await stripe.paymentMethods.retrieve(pmId)
        const last4 = pm.card?.last4 ?? null

        await supabaseAdmin
          .from('locations')
          .update({
            consult_stripe_customer_id: customerId,
            consult_stripe_payment_method_id: pmId,
            consult_billing_status: 'active',
            consult_stripe_card_last4: last4,
            consult_enabled: true,
            consult_stripe_checkout_session_id: null,
          })
          .eq('id', locationId)

        revalidatePath(`/shops/${locationId}`)
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'setup') {
        const locationId = session.metadata?.location_id?.trim()
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id
        const setupIntentId =
          typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id
        if (locationId && customerId && setupIntentId) {
          const si = await stripe.setupIntents.retrieve(setupIntentId)
          const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
          if (pmId && si.status === 'succeeded') {
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: pmId },
            })
            const pm = await stripe.paymentMethods.retrieve(pmId)
            await supabaseAdmin
              .from('locations')
              .update({
                consult_stripe_customer_id: customerId,
                consult_stripe_payment_method_id: pmId,
                consult_billing_status: 'active',
                consult_stripe_card_last4: pm.card?.last4 ?? null,
                consult_enabled: true,
                consult_stripe_checkout_session_id: null,
              })
              .eq('id', locationId)
            revalidatePath(`/shops/${locationId}`)
          }
        }
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      if (customerId) {
        await supabaseAdmin
          .from('locations')
          .update({ consult_billing_status: 'payment_failed' })
          .eq('consult_stripe_customer_id', customerId)
      }
    }

    if (event.type === 'payment_method.detached') {
      const pm = event.data.object as Stripe.PaymentMethod
      const pmId = pm.id
      if (pmId) {
        await supabaseAdmin
          .from('locations')
          .update({
            consult_stripe_payment_method_id: null,
            consult_stripe_card_last4: null,
            consult_billing_status: 'not_setup',
          })
          .eq('consult_stripe_payment_method_id', pmId)
      }
    }
  } catch (e) {
    console.error('stripe webhook handler', e)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
