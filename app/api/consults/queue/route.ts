import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { fetchOpenCasesQueue, fetchPendingApprovalQueue } from '@/lib/expert-assist/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAppSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [pending, open] = await Promise.all([fetchPendingApprovalQueue(), fetchOpenCasesQueue()])
    return NextResponse.json({
      pending,
      open,
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
