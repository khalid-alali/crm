import TeslaBoard from '@/components/tesla/TeslaBoard'
import { attachPrimaryContactsToLocations } from '@/lib/primary-contact'
import { supabaseAdmin } from '@/lib/supabase'
import { listTeslaEnrollments } from '@/lib/tesla-enrollments'

export const dynamic = 'force-dynamic'

export default async function TeslaPage() {
  const enrollments = await listTeslaEnrollments(supabaseAdmin)
  const locationIds = [...new Set(enrollments.map(e => e.locationId))]

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
      <TeslaBoard initialEnrollments={enrollments} mapLocations={mapLocations as any} />
    </div>
  )
}
