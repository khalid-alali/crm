import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { getStripe } from '@/lib/expert-assist/billing-charge'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: locationId } = await ctx.params

  const { data: loc, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, consult_billing_email, consult_stripe_customer_id')
    .eq('id', locationId)
    .maybeSingle()

  if (error || !loc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stripe = getStripe()
  let customerId = (loc as { consult_stripe_customer_id: string | null }).consult_stripe_customer_id?.trim() || null

  if (!customerId) {
    const email = (loc as { consult_billing_email: string | null }).consult_billing_email?.trim() || undefined
    const customer = await stripe.customers.create({
      email,
      name: (loc as { name: string }).name,
      metadata: { location_id: locationId },
    })
    customerId = customer.id
    await supabaseAdmin.from('locations').update({ consult_stripe_customer_id: customerId }).eq('id', locationId)
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    metadata: { location_id: locationId },
  })

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? null,
  })
}
