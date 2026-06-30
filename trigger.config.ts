import { defineConfig } from '@trigger.dev/sdk'
import { syncVercelEnvVars } from '@trigger.dev/build/extensions/core'

const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim()
const vercelAccessToken = process.env.VERCEL_ACCESS_TOKEN?.trim()
const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim()

/**
 * Expert Assist tasks read the same secrets as the CRM on Vercel (Supabase, Resend, Twilio, …).
 *
 * Preferred: connect the Trigger.dev Vercel integration (Marketplace) so env vars sync on every deploy.
 * Fallback: set VERCEL_ACCESS_TOKEN + VERCEL_PROJECT_ID when running `npm run trigger:deploy` —
 * syncVercelEnvVars pulls Vercel production env into Trigger.dev before the build.
 *
 * Do not enable syncVercelEnvVars if you already use the Vercel integration (conflicts).
 */
const vercelEnvSync =
  vercelProjectId && vercelAccessToken ?
    [
      syncVercelEnvVars({
        projectId: vercelProjectId,
        vercelAccessToken,
        ...(vercelTeamId ? { vercelTeamId } : {}),
      }),
    ]
  : []

export default defineConfig({
  project: 'proj_mmfakexmtavtngjamrdv',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 3600,
  dirs: ['./trigger'],
  build: {
    extensions: vercelEnvSync,
  },
})
