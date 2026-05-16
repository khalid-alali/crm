import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { assertShopCanRunConsults } from '@/lib/expert-assist/billing-gates'
import { normalizeSmsAddress } from '@/lib/expert-assist/phone'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: shopId } = await ctx.params
  const { phone_number, display_name, approve_directly } = (await req.json()) as {
    phone_number?: string
    display_name?: string | null
    approve_directly?: boolean
  }

  const gate = await assertShopCanRunConsults(shopId)
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 400 })

  const phone = normalizeSmsAddress(phone_number)
  if (!phone) return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })

  const now = new Date().toISOString()
  const approved = Boolean(approve_directly)

  const { data: row, error } = await supabaseAdmin
    .from('shop_approved_contacts')
    .insert({
      shop_id: shopId,
      phone_number: phone,
      display_name: display_name?.trim() || null,
      status: approved ? 'approved' : 'pending',
      added_via: 'expert_added',
      approved_at: approved ? now : null,
      approved_by_user_id: approved ? session.user.email : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  revalidatePath(`/shops/${shopId}`)
  return NextResponse.json({ id: row?.id })
}
