import Link from 'next/link'
import { notFound } from 'next/navigation'
import ConsultCaseDetailView from '@/components/expert-assist/ConsultCaseDetailView'
import { fetchConsultCaseDetail, fetchConsultCaseNeighbors } from '@/lib/expert-assist/queries'

export const dynamic = 'force-dynamic'

export default async function ConsultCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let detail: Awaited<ReturnType<typeof fetchConsultCaseDetail>> = null
  let neighbors: Awaited<ReturnType<typeof fetchConsultCaseNeighbors>> = { prevId: null, nextId: null }
  let loadError: string | null = null

  try {
    ;[detail, neighbors] = await Promise.all([fetchConsultCaseDetail(id), fetchConsultCaseNeighbors(id)])
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ConsultCaseDetailView
        caseId={id}
        caseRow={detail.case}
        messages={detail.messages}
        shopContext={detail.shopContext}
        prevCaseId={neighbors.prevId}
        nextCaseId={neighbors.nextId}
      />
    </div>
  )
}
