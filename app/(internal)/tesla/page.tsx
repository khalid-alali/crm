import TeslaBoard from '@/components/tesla/TeslaBoard'
import { supabaseAdmin } from '@/lib/supabase'
import { listTeslaEnrollments } from '@/lib/tesla-enrollments'

export const dynamic = 'force-dynamic'

export default async function TeslaPage() {
  const enrollments = await listTeslaEnrollments(supabaseAdmin)

  return (
    <div className="p-6">
      <TeslaBoard initialEnrollments={enrollments} />
    </div>
  )
}
