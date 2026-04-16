'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import EmailModal from './EmailModal'
import type { TemplateKey } from '@/lib/email-templates'

const nextActionMap: Record<string, { label: string; action: string; template?: TemplateKey }> = {
  lead: { label: 'Send intro', action: 'email', template: 'intro' },
  contacted: { label: 'Send follow-up', action: 'email', template: 'followup' },
  in_review: { label: 'Send contract', action: 'contract' },
  contracted: { label: 'Start onboarding', action: 'email', template: 'onboarding' },
  active: { label: 'View details', action: 'navigate' },
  inactive: { label: 'Re-engage', action: 'email', template: 'reengage' },
}

interface Props {
  locationId: string
  status: string
  shopName: string
  contactName: string
  contactEmail: string
  senderName: string
  onStatusChange?: () => void
}

export default function NextActionButton({
  locationId,
  status,
  shopName,
  contactName,
  contactEmail,
  senderName,
  onStatusChange,
}: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const config = nextActionMap[status]
  if (!config) return null

  function handleClick() {
    if (config.action === 'navigate') {
      router.push(`/shops/${locationId}`)
    } else if (config.action === 'email') {
      setShowModal(true)
    } else if (config.action === 'contract') {
      router.push(`/shops/${locationId}?tab=contracts`)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100 whitespace-nowrap"
      >
        {config.label}
      </button>
      {showModal && config.template && (
        <EmailModal
          locationId={locationId}
          shopName={shopName}
          contactName={contactName}
          contactEmail={contactEmail}
          template={config.template}
          senderName={senderName}
          onClose={() => setShowModal(false)}
          onSent={() => {
            setShowModal(false)
            onStatusChange?.()
          }}
        />
      )}
    </>
  )
}
