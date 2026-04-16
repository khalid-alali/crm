import { supabaseAdmin } from '@/lib/supabase'
import MapView from './MapView'

export default async function MapPage() {
  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select(
      'id, name, chain_name, city, state, status, lat, lng, address_line1, primary_contact_name, primary_contact_email',
    )

  return (
    <div className="h-screen flex flex-col">
      <MapView locations={locations ?? []} />
    </div>
  )
}
