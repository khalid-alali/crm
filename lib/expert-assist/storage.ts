import { randomUUID } from 'crypto'
import { CONSULT_MEDIA_BUCKET, consultMediaObjectPath } from '@/lib/expert-assist/constants'
import { getTwilioBasicAuthHeader } from '@/lib/expert-assist/twilio-client'
import { supabaseAdmin } from '@/lib/supabase'

function extFromContentType(ct: string | null, fallback: string): string {
  if (!ct) return fallback
  const m = ct.split('/')[1]
  if (!m) return fallback
  const clean = m.split(';')[0]?.trim()
  if (clean === 'jpeg') return 'jpg'
  return clean || fallback
}

export async function downloadTwilioMediaToConsultStorage(params: {
  caseId: string
  twilioMediaUrl: string
  contentType?: string | null
}): Promise<string | null> {
  const { caseId, twilioMediaUrl } = params
  const auth = getTwilioBasicAuthHeader()
  if (!auth) {
    console.error(
      'downloadTwilioMediaToConsultStorage: set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN for legacy'
    )
    return null
  }

  const res = await fetch(twilioMediaUrl, {
    headers: { Authorization: auth },
  })
  if (!res.ok) {
    console.error('downloadTwilioMediaToConsultStorage HTTP', res.status)
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') ?? params.contentType ?? 'application/octet-stream'
  const ext = extFromContentType(ct, 'bin')
  const objectPath = consultMediaObjectPath(caseId, `${randomUUID()}.${ext}`)

  const { error } = await supabaseAdmin.storage.from(CONSULT_MEDIA_BUCKET).upload(objectPath, buf, {
    contentType: ct,
    upsert: false,
  })
  if (error) {
    console.error('consult media upload', error.message)
    return null
  }

  return objectPath
}

export async function createConsultMediaSignedUrls(paths: string[], expiresSec = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await Promise.all(
    paths.map(async p => {
      const { data, error } = await supabaseAdmin.storage.from(CONSULT_MEDIA_BUCKET).createSignedUrl(p, expiresSec)
      if (!error && data?.signedUrl) out.set(p, data.signedUrl)
    })
  )
  return out
}
