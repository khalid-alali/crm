/** Supabase Storage bucket id for Twilio MMS rehost (private). */
export const CONSULT_MEDIA_BUCKET = 'consult-media'

/** Path prefix within bucket — full path `cases/{caseId}/{fileName}`. */
export function consultMediaObjectPath(caseId: string, fileName: string): string {
  return `cases/${caseId}/${fileName}`
}

export function twilioStatusCallbackUrl(): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? ''
  return `${base}/api/twilio/status`
}

export function expertAssistPublicBaseUrl(): string {
  const raw =
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? ''
  return raw
}
