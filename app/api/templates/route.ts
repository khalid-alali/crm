import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { isEmailTemplateCategory } from '@/lib/email-template-categories'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === '1'

  let q = supabaseAdmin
    .from('email_templates')
    .select(
      'id, name, category, description, subject, body_html, default_recipients, default_cc_recipients, created_by, archived, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (!includeArchived) {
    q = q.eq('archived', false)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html : ''
  const description =
    typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const defaultRecipients = Array.isArray(body.default_recipients)
    ? Array.from(
        new Set(
          body.default_recipients
            .filter((v): v is string => typeof v === 'string')
            .map(v => v.trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : null
  const defaultCcRecipients = Array.isArray(body.default_cc_recipients)
    ? Array.from(
        new Set(
          body.default_cc_recipients
            .filter((v): v is string => typeof v === 'string')
            .map(v => v.trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : null

  if (!name || !category || !subject) {
    return NextResponse.json({ error: 'name, category, and subject are required' }, { status: 400 })
  }
  if (!isEmailTemplateCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const createdBy = session.user?.email?.trim() || null

  const { data: row, error } = await supabaseAdmin
    .from('email_templates')
    .insert({
      name,
      category,
      description,
      subject,
      body_html: bodyHtml,
      default_recipients: defaultRecipients && defaultRecipients.length > 0 ? defaultRecipients : null,
      default_cc_recipients:
        defaultCcRecipients && defaultCcRecipients.length > 0 ? defaultCcRecipients : null,
      created_by: createdBy,
      archived: false,
    })
    .select(
      'id, name, category, description, subject, body_html, default_recipients, default_cc_recipients, created_by, archived, created_at, updated_at',
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(row)
}
