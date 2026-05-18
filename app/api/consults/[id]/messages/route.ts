import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppSession } from '@/lib/app-auth'
import { validateConsultMmsUpload } from '@/lib/expert-assist/consult-media'
import { insertConsultCaseEvent } from '@/lib/expert-assist/events'
import { sendConsultSms } from '@/lib/expert-assist/send-sms'
import { formatTwilioSendError } from '@/lib/expert-assist/twilio-messaging'
import { uploadConsultOutboundMedia } from '@/lib/expert-assist/storage'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

async function parseOutboundPayload(
  req: NextRequest
): Promise<{ text: string; mediaFile: File | null; error?: string }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const textRaw = form.get('text')
    const text = typeof textRaw === 'string' ? textRaw.trim() : ''
    const mediaEntry = form.get('media')
    const mediaFile = mediaEntry instanceof File && mediaEntry.size > 0 ? mediaEntry : null
    if (mediaFile) {
      const err = validateConsultMmsUpload(mediaFile.type || 'application/octet-stream', mediaFile.size)
      if (err) return { text, mediaFile: null, error: err }
    }
    return { text, mediaFile }
  }

  const { text } = (await req.json()) as { text?: string }
  return { text: typeof text === 'string' ? text.trim() : '', mediaFile: null }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAppSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: Awaited<ReturnType<typeof parseOutboundPayload>>
  try {
    payload = await parseOutboundPayload(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (payload.error) return NextResponse.json({ error: payload.error }, { status: 400 })

  const { text, mediaFile } = payload
  if (!text && !mediaFile) {
    return NextResponse.json({ error: 'text or image required' }, { status: 400 })
  }

  const { id: caseId } = await ctx.params

  const { data: c, error } = await supabaseAdmin
    .from('consult_cases')
    .select('id, status, originating_phone_number')
    .eq('id', caseId)
    .maybeSingle()

  if (error || !c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'open') {
    return NextResponse.json({ error: 'Can only message open cases' }, { status: 400 })
  }

  let mediaPaths: string[] = []
  if (mediaFile) {
    const buf = Buffer.from(await mediaFile.arrayBuffer())
    const path = await uploadConsultOutboundMedia({
      caseId,
      buffer: buf,
      contentType: mediaFile.type || 'application/octet-stream',
    })
    mediaPaths = [path]
  }

  try {
    await sendConsultSms({
      to: c.originating_phone_number,
      body: text,
      caseId,
      logDirection: 'outbound',
      mediaPaths,
    })
  } catch (e) {
    console.error('sendConsultSms', e)
    return NextResponse.json({ error: formatTwilioSendError(e) }, { status: 502 })
  }

  await insertConsultCaseEvent({
    caseId,
    eventType: 'note_added',
    actorType: 'expert',
    actorId: session.user.email,
    metadata: { kind: mediaPaths.length ? 'mms_outbound' : 'sms_outbound' },
  })

  revalidatePath('/consults')
  revalidatePath(`/consults/${caseId}`)
  return NextResponse.json({ ok: true })
}
