/**
 * Env vars that Trigger.dev task runs need at runtime (mirror Vercel production).
 * Keep in sync with expert-assist.env.example → "Trigger.dev production".
 */
export const TRIGGER_ACTIVATION_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'CRM_PUBLIC_BASE_URL',
  'EXPERT_ASSIST_SURFACES_PUBLIC_URL',
  'EXPERT_ASSIST_INTAKE_PUBLIC_URL',
  'EXPERT_ASSIST_TOLL_FREE_NUMBER',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
  'TWILIO_WEBHOOK_BASE_URL',
  'EXPERT_ASSIST_SLACK_WEBHOOK_URL',
  'EXPERT_ASSIST_CALL_CONFIRM_SMS',
] as const

export type ResendConfig = { apiKey: string; from: string }

export function requireResendConfig(operation: string): ResendConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      `RESEND_API_KEY is not set (${operation}). ` +
        'Expert Assist emails run in Trigger.dev — add RESEND_API_KEY to the Trigger prod environment ' +
        '(Vercel integration env sync, or npm run trigger:deploy with VERCEL_ACCESS_TOKEN set).',
    )
  }

  return {
    apiKey,
    from: process.env.RESEND_FROM?.trim() || 'Fixlane <onboarding@resend.dev>',
  }
}
