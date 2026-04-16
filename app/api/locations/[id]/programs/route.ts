import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAppSession } from '@/lib/app-auth'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { program, status } = await req.json()

  const { error } = await supabaseAdmin
    .from('program_enrollments')
    .upsert({ location_id: params.id, program, status }, { onConflict: 'location_id,program' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
