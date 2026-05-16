import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import ConsultCaseDetail from '@/components/expert-assist/ConsultCaseDetail'
import { fetchConsultCaseDetail } from '@/lib/expert-assist/queries'

export const dynamic = 'force-dynamic'

export default async function ConsultCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let detail: Awaited<ReturnType<typeof fetchConsultCaseDetail>> = null
  let loadError: string | null = null

  try {
    detail = await fetchConsultCaseDetail(id)
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  if (loadError?.includes('does not exist') || loadError?.includes('42P01')) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-onix-900">Database not migrated</p>
        <p className="mt-1 text-sm text-onix-600">{loadError}</p>
        <Link href="/consults" className="mt-4 inline-block text-sm text-brand-700 hover:underline">
          Back to queue
        </Link>
      </div>
    )
  }

  if (!detail) notFound()

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-arctic-200 bg-white px-6 py-3">
        <nav className="mb-2 flex items-center gap-1 text-xs text-onix-500">
          <Link href="/home" className="hover:text-brand-700 hover:underline">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <Link href="/consults" className="hover:text-brand-700 hover:underline">
            Consults
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="truncate text-onix-700">Case · {detail.case.shop?.name ?? detail.case.originating_phone_number}</span>
        </nav>
        <h1 className="text-lg font-semibold text-onix-950">Consult case</h1>
      </header>
      <ConsultCaseDetail caseId={id} caseRow={detail.case} messages={detail.messages} />
    </div>
  )
}
