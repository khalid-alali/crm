import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/app-auth'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_PER_GROUP = 4

type LocationRow = {
  id: string
  name: string
  status: string | null
  motherduck_shop_id: string | null
  account_id: string | null
  updated_at: string
}

type ContactRow = {
  id: string
  name: string | null
  email: string | null
  location_id: string | null
  account_id: string | null
}

type AccountRow = {
  id: string
  business_name: string | null
}

type SearchResponse = {
  shops: Array<{ id: string; name: string; status: string | null }>
  contacts: Array<{ id: string; name: string; email: string | null; shop_id: string; shop_name: string }>
  accounts: Array<{ id: string; name: string; shop_id: string; shop_name: string }>
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0)))
}

export async function GET(req: NextRequest) {
  const session = await getAppSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    const empty: SearchResponse = { shops: [], contacts: [], accounts: [] }
    return NextResponse.json(empty)
  }

  const shopQuery = supabaseAdmin
    .from('locations')
    .select('id, name, status')
    .or(`name.ilike.%${q}%,motherduck_shop_id.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(MAX_PER_GROUP)

  const contactsQuery = supabaseAdmin
    .from('contacts')
    .select('id, name, email, location_id, account_id')
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  const accountsQuery = supabaseAdmin
    .from('accounts')
    .select('id, business_name')
    .ilike('business_name', `%${q}%`)
    .order('business_name', { ascending: true })
    .limit(20)

  const [{ data: shopsData, error: shopsError }, { data: contactsData, error: contactsError }, { data: accountsData, error: accountsError }] =
    await Promise.all([shopQuery, contactsQuery, accountsQuery])

  if (shopsError || contactsError || accountsError) {
    console.error('global search query failed', shopsError ?? contactsError ?? accountsError)
    const empty: SearchResponse = { shops: [], contacts: [], accounts: [] }
    return NextResponse.json(empty)
  }

  const contacts = (contactsData ?? []) as ContactRow[]
  const accounts = (accountsData ?? []) as AccountRow[]

  const directLocationIds = uniqueStrings(contacts.map(c => c.location_id))
  const accountIds = uniqueStrings([...contacts.map(c => c.account_id), ...accounts.map(a => a.id)])

  const [directLocationsRes, fallbackLocationsRes] = await Promise.all([
    directLocationIds.length
      ? supabaseAdmin
          .from('locations')
          .select('id, name, account_id, status, motherduck_shop_id, updated_at')
          .in('id', directLocationIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabaseAdmin
          .from('locations')
          .select('id, name, account_id, status, motherduck_shop_id, updated_at')
          .in('account_id', accountIds)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (directLocationsRes.error || fallbackLocationsRes.error) {
    console.error('global search location resolution failed', directLocationsRes.error ?? fallbackLocationsRes.error)
    const empty: SearchResponse = { shops: [], contacts: [], accounts: [] }
    return NextResponse.json(empty)
  }

  const directLocations = (directLocationsRes.data ?? []) as LocationRow[]
  const fallbackLocations = (fallbackLocationsRes.data ?? []) as LocationRow[]

  const locationById = new Map(directLocations.map(loc => [loc.id, loc]))
  const fallbackLocationByAccountId = new Map<string, LocationRow>()
  for (const location of fallbackLocations) {
    if (location.account_id && !fallbackLocationByAccountId.has(location.account_id)) {
      fallbackLocationByAccountId.set(location.account_id, location)
    }
  }

  const shopResults = ((shopsData ?? []) as Array<{ id: string; name: string; status: string | null }>).slice(0, MAX_PER_GROUP)

  const contactResults: SearchResponse['contacts'] = []
  for (const contact of contacts) {
    const direct = contact.location_id ? locationById.get(contact.location_id) : null
    const fallback = contact.account_id ? fallbackLocationByAccountId.get(contact.account_id) : null
    const target = direct ?? fallback ?? null
    if (!target) continue

    const name = text(contact.name) || 'Unnamed contact'
    contactResults.push({
      id: contact.id,
      name,
      email: text(contact.email) || null,
      shop_id: target.id,
      shop_name: target.name,
    })
    if (contactResults.length >= MAX_PER_GROUP) break
  }

  const accountResults: SearchResponse['accounts'] = []
  for (const account of accounts) {
    const target = fallbackLocationByAccountId.get(account.id)
    if (!target) continue

    accountResults.push({
      id: account.id,
      name: text(account.business_name) || 'Unnamed account',
      shop_id: target.id,
      shop_name: target.name,
    })
    if (accountResults.length >= MAX_PER_GROUP) break
  }

  return NextResponse.json({
    shops: shopResults,
    contacts: contactResults,
    accounts: accountResults,
  } satisfies SearchResponse)
}
