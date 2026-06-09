'use client'

import { useState } from 'react'
import ConsultActivationBoard from '@/components/expert-assist/ConsultActivationBoard'
import ConsultQueueTables from '@/components/expert-assist/ConsultQueueTables'
import type { ExpertAssistEnrollmentView } from '@/lib/expert-assist-enrollments'
import type { ConsultQueueRow } from '@/lib/expert-assist/types'

type TabKey = 'queue' | 'funnel'

type Props = {
  pending: ConsultQueueRow[]
  open: ConsultQueueRow[]
  schemaError: string | null
  funnelEnrollments: ExpertAssistEnrollmentView[]
  funnelError: string | null
}

export default function ConsultsPageClient({
  pending,
  open,
  schemaError,
  funnelEnrollments,
  funnelError,
}: Props) {
  const [tab, setTab] = useState<TabKey>('queue')

  return (
    <div className="min-h-0 flex-1 overflow-auto px-10 pt-8 pb-20">
      <div className="mx-auto mb-6 flex max-w-[1400px] gap-1 rounded-lg border border-arctic-200 bg-arctic-50 p-1">
        <button
          type="button"
          onClick={() => setTab('queue')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'queue' ? 'bg-white text-onix-900 shadow-sm' : 'text-onix-600 hover:text-onix-900'
          }`}
        >
          Queue
        </button>
        <button
          type="button"
          onClick={() => setTab('funnel')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'funnel' ? 'bg-white text-onix-900 shadow-sm' : 'text-onix-600 hover:text-onix-900'
          }`}
        >
          Activation funnel
        </button>
      </div>

      {tab === 'queue' ? (
        <ConsultQueueTables pending={pending} open={open} schemaError={schemaError} />
      ) : funnelError ? (
        <div className="mx-auto max-w-[1400px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Activation funnel not available</p>
          <p className="mt-1 text-amber-900/90">{funnelError}</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[1600px]">
          <ConsultActivationBoard initialEnrollments={funnelEnrollments} />
        </div>
      )}
    </div>
  )
}
