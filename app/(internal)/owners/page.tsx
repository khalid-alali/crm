import OwnersTable, { type OwnerListRow } from '@/components/OwnersTable'
import { supabaseAdmin } from '@/lib/supabase'

type OwnerQueryRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
  locations: { count: number }[] | null
}

export default async function OwnersPage() {
  const { data: ownersRaw } = await supabaseAdmin
    .from('owners')
    .select('id, name, email, phone, created_at, locations(count)')
    .order('name')

  const owners: OwnerListRow[] = ((ownersRaw ?? []) as OwnerQueryRow[]).map(o => ({
    id: o.id,
    name: o.name,
    email: o.email,
    phone: o.phone,
    location_count: Number(o.locations?.[0]?.count ?? 0),
  }))

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-4">Owners</h1>
      <OwnersTable owners={owners} />
    </div>
  )
}
