import { supabaseAdmin } from '@/lib/supabase'
import MapView from './MapView'
import { attachPrimaryContactsToLocations } from '@/lib/primary-contact'

export default async function MapPage() {
  const { data: locs } = await supabaseAdmin
    .from('locations')
    .select('id, name, chain_name, city, state, status, lat, lng, address_line1, account_id')

  const locations = await attachPrimaryContactsToLocations(
    supabaseAdmin,
    (locs ?? []) as { id: string; account_id: string | null }[],
  )

  return (
    <div className="h-screen flex flex-col">
      <MapView locations={locations as any} />
    </div>
  )
}
