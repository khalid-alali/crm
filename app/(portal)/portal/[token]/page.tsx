import { verifyPortalToken } from '@/lib/portal-token'
import { supabaseAdmin } from '@/lib/supabase'
import PortalForm from './PortalForm'

export default async function PortalPage({ params }: { params: { token: string } }) {
  let locationId: string
  try {
    const payload = verifyPortalToken(params.token)
    locationId = payload.locationId
  } catch {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-red-600">Link expired or invalid</h1>
          <p className="text-sm text-gray-500 mt-2">Please request a new link from RepairWise.</p>
        </div>
      </div>
    )
  }

  const { data: location } = await supabaseAdmin
    .from('locations')
    .select('*, program_enrollments(*)')
    .eq('id', locationId)
    .single()

  if (!location) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Shop not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold">RepairWise Partner Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Confirm your shop information</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <PortalForm location={location as any} token={params.token} />
        </div>
      </div>
    </div>
  )
}
