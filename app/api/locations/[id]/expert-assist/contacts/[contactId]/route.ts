import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: shopId, contactId } = await ctx.params
  const { display_name } = (await req.json()) as { display_name?: string | null }

  const { error } = await supabaseAdmin
    .from('shop_approved_contacts')
    .update({ display_name: display_name?.trim() || null })
    .eq('id', contactId)
    .eq('shop_id', shopId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath(`/shops/${shopId}`)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: shopId, contactId } = await ctx.params
  const now = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('shop_approved_contacts')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_by_user_id: session.user.email,
    })
    .eq('id', contactId)
    .eq('shop_id', shopId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath(`/shops/${shopId}`)
  return NextResponse.json({ ok: true })
}
