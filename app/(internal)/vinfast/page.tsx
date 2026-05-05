import VinfastBoard from '@/components/vinfast/VinfastBoard'
import { attachPrimaryContactsToLocations } from '@/lib/primary-contact'
import { supabaseAdmin } from '@/lib/supabase'
import { listVinfastEnrollments } from '@/lib/vinfast-enrollments'

export const dynamic = 'force-dynamic'

export default async function VinfastPage() {
  const enrollments = await listVinfastEnrollments(supabaseAdmin)
  const locationIds = [...new Set(enrollments.map(e => e.locationId))]
  const { data: allLocationRows } = await supabaseAdmin
    .from('locations')
    .select('id, name, city, state')
    .order('name', { ascending: true })

  const { data: locRows } =
    locationIds.length > 0
      ? await supabaseAdmin
          .from('locations')
          .select('id, name, chain_name, city, state, county, status, lat, lng, address_line1, account_id')
          .in('id', locationIds)
      : { data: [] as { id: string; account_id: string | null }[] }

  const mapLocations = await attachPrimaryContactsToLocations(
    supabaseAdmin,
    (locRows ?? []) as { id: string; account_id: string | null }[],
  )

  return (
    <div className="p-6">
      <VinfastBoard
        initialEnrollments={enrollments}
        mapLocations={mapLocations as any}
        allLocations={(allLocationRows ?? []) as Array<{ id: string; name: string; city: string | null; state: string | null }>}
      />
    </div>
  )
}
