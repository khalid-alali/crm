import VinfastBoard from '@/components/vinfast/VinfastBoard'
import { activeLocations } from '@/lib/locations-active'
import { attachPrimaryContactsToLocations } from '@/lib/primary-contact'
import { supabaseAdmin } from '@/lib/supabase'
import { listVinfastEnrollments } from '@/lib/vinfast-enrollments'

export const dynamic = 'force-dynamic'

export default async function VinfastPage() {
  const enrollments = await listVinfastEnrollments(supabaseAdmin)
  const locationIds = [...new Set(enrollments.map(e => e.locationId))]

  const { data: locRows } =
    locationIds.length > 0
      ? await activeLocations(supabaseAdmin, 'id, name, chain_name, city, state, county, status, lat, lng, address_line1, account_id')
          .in('id', locationIds)
      : { data: [] as { id: string; account_id: string | null }[] }

  const mapLocations = await attachPrimaryContactsToLocations(
    supabaseAdmin,
    (locRows ?? []) as { id: string; account_id: string | null }[],
  )

  return (
    <div className="p-6">
      <VinfastBoard initialEnrollments={enrollments} mapLocations={mapLocations as any} />
    </div>
  )
}
