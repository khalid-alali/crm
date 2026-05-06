import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { isEmailTemplateCategory } from '@/lib/email-template-categories'
import { supabaseAdmin } from '@/lib/supabase'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === '1'

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select(
      'id, name, category, description, subject, body_html, default_recipients, default_cc_recipients, created_by, archived, created_at, updated_at',
    )
    .eq('id', id.trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!includeArchived && data.archived) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}

  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.subject === 'string') patch.subject = body.subject.trim()
  if (typeof body.body_html === 'string') patch.body_html = body.body_html
  if (body.description === null) patch.description = null
  else if (typeof body.description === 'string') patch.description = body.description.trim() || null
  if (Array.isArray(body.default_recipients)) {
    const values = Array.from(
      new Set(
        body.default_recipients
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim().toLowerCase())
          .filter(Boolean),
      ),
    )
    patch.default_recipients = values.length > 0 ? values : null
  } else if (body.default_recipients === null) {
    patch.default_recipients = null
  }
  if (Array.isArray(body.default_cc_recipients)) {
    const values = Array.from(
      new Set(
        body.default_cc_recipients
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim().toLowerCase())
          .filter(Boolean),
      ),
    )
    patch.default_cc_recipients = values.length > 0 ? values : null
  } else if (body.default_cc_recipients === null) {
    patch.default_cc_recipients = null
  }
  if (typeof body.category === 'string') {
    const c = body.category.trim()
    if (!isEmailTemplateCategory(c)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    patch.category = c
  }
  if (typeof body.archived === 'boolean') patch.archived = body.archived

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .update(patch)
    .eq('id', id.trim())
    .select(
      'id, name, category, description, subject, body_html, default_recipients, default_cc_recipients, created_by, archived, created_at, updated_at',
    )
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .update({ archived: true })
    .eq('id', id.trim())
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
