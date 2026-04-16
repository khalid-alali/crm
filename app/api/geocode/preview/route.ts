import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocode'
import { getAppSession } from '@/lib/app-auth'

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const coords = await geocodeAddress({
    address_line1: sp.get('address_line1') ?? undefined,
    city: sp.get('city') ?? undefined,
    state: sp.get('state') ?? undefined,
    postal_code: sp.get('postal_code') ?? undefined,
  })

  return NextResponse.json(coords ?? {})
}
