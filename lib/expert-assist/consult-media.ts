/** Twilio MMS limits — keep under typical serverless request body caps (~4.5 MB). */
export const CONSULT_MMS_MAX_BYTES = 4 * 1024 * 1024

export const CONSULT_MMS_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

export function normalizeMmsContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function validateConsultMmsUpload(contentType: string, byteLength: number): string | null {
  const ct = normalizeMmsContentType(contentType)
  if (!CONSULT_MMS_ALLOWED_CONTENT_TYPES.has(ct)) {
    return 'Only JPEG, PNG, GIF, and WebP images are supported for MMS.'
  }
  if (byteLength <= 0) return 'Image file is empty.'
  if (byteLength > CONSULT_MMS_MAX_BYTES) return 'Image must be 4 MB or smaller.'
  return null
}

export function inboundMediaCount(form: Record<string, string>): number {
  return Number.parseInt(form['NumMedia'] ?? '0', 10) || 0
}

export function hasInboundMedia(form: Record<string, string>): boolean {
  return inboundMediaCount(form) > 0
}
