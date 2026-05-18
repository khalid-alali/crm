/**
 * Expert Assist — consult queue (internal).
 * When wiring navigation: add to `InternalSidebarNav` navItems:
 * { href: '/consults', label: 'Consults', icon: MessageSquare }
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import ConsultQueueTables from '@/components/expert-assist/ConsultQueueTables'
import { fetchOpenCasesQueue, fetchPendingApprovalQueue } from '@/lib/expert-assist/queries'

export const dynamic = 'force-dynamic'

export default async function ConsultsQueuePage() {
  let pending: Awaited<ReturnType<typeof fetchPendingApprovalQueue>> = []
  let open: Awaited<ReturnType<typeof fetchOpenCasesQueue>> = []
  let schemaError: string | null = null

  try {
    ;[pending, open] = await Promise.all([fetchPendingApprovalQueue(), fetchOpenCasesQueue()])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('consult_cases') || msg.includes('does not exist') || msg.includes('42P01')) {
      schemaError =
        'The consult_cases table was not found. Apply the Expert Assist migration, then refresh this page.'
    } else {
      schemaError = msg
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-arctic-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-1 text-xs text-onix-500">
          <Link href="/home" className="hover:text-brand-700 hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-onix-700">Consults</span>
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-10 pt-8 pb-20">
        <ConsultQueueTables pending={pending} open={open} schemaError={schemaError} />
      </div>
    </div>
  )
}
