import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid shop id' }, { status: 400 })

  const expectedSecret = process.env.ZAPIER_WEBHOOK_SECRET?.trim() ?? ''
  const providedSecret = req.headers.get('x-webhook-secret')?.trim() ?? ''
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = body as { routable_id?: unknown; quickbooks_vendor_id?: unknown }
  const routableId = cleanText(payload.routable_id)
  const quickbooksVendorId = cleanText(payload.quickbooks_vendor_id)
  if (!routableId && !quickbooksVendorId) {
    return NextResponse.json(
      { error: 'At least one of routable_id or quickbooks_vendor_id is required' },
      { status: 400 },
    )
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 })
  if (!location) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })

  const { error: updateError } = await supabaseAdmin
    .from('locations')
    .update({
      routable_id: routableId ?? null,
      quickbooks_vendor_id: quickbooksVendorId ?? null,
      routable_enrolled_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await supabaseAdmin.from('activity_log').insert({
    location_id: id,
    type: 'routable_enrolled',
    subject: 'Routable enrolled',
    body: JSON.stringify({
      routable_id: routableId,
      quickbooks_vendor_id: quickbooksVendorId,
    }),
    sent_by: 'zapier',
  })

  return NextResponse.json({ ok: true })
}
