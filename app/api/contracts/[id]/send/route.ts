import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'
import { sendContractViaZoho } from '@/lib/contract-zoho-send'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let fromShopDetail = false
  try {
    const raw = await req.text()
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { fromShopDetail?: boolean }
      fromShopDetail = Boolean(parsed?.fromShopDetail)
    }
  } catch {
    /* non-JSON body or empty */
  }

  const { data: contract } = await supabaseAdmin.from('contracts').select('id').eq('id', params.id).single()

  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

  try {
    await sendContractViaZoho(params.id, {
      fromShopDetail,
      sentBy: session.user?.email ?? 'unknown',
      bdContactName: session.user?.name,
      bdContactEmail: session.user?.email,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Zoho Sign failed'
    const status = message === 'Contract not found' ? 404 : message.includes('recipient') ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
