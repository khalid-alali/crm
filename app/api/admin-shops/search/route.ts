import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { searchMotherduckAdminShops } from '@/lib/motherduck-admin-shop-search'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const results = await searchMotherduckAdminShops(q)
    return NextResponse.json({ results })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'MotherDuck search failed'
    if (message.includes('MOTHERDUCK_TOKEN')) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
