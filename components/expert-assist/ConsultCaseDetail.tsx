'use client'

import { CheckCheck, Clock } from 'lucide-react'
import { formatDeliveryReceipt, formatMessageTime } from '@/lib/expert-assist/case-display'
import { eaPillClass } from '@/components/expert-assist/ea-ui'
import { getQueuePill } from '@/lib/expert-assist/queue-display'
import type { ConsultMessageRow, ConsultQueueRow } from '@/lib/expert-assist/types'

export type CaseDetailModel = ConsultQueueRow & {
  expert_notes: string | null
  outcome: string | null
  closed_at: string | null
  originating_contact_id: string | null
}

export function pillClass(kind: ReturnType<typeof getQueuePill>): string {
  return eaPillClass(kind)
}

function MessageAttachments({
  urls,
  messageId,
  onImageClick,
}: {
  urls: string[]
  messageId: string
  onImageClick: (url: string) => void
}) {
  if (!urls.length) return null
  return (
    <>
      {urls.map((url, i) => (
        <div key={`${messageId}-${i}`}>
          <button
            type="button"
            className="ea-msg-attachment"
            onClick={() => onImageClick(url)}
            aria-label={`Open attachment ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
          </button>
          <div className="ea-msg-attachment-label">Attachment · tap to enlarge</div>
        </div>
      ))}
    </>
  )
}

export function MessageBubble({
  m,
  shopName,
  contactName,
  onImageClick,
}: {
  m: ConsultMessageRow
  shopName: string
  contactName: string
  onImageClick: (url: string) => void
}) {
  const urls = m.media_display_urls ?? m.media_urls ?? []

  if (m.direction === 'system') {
    return (
      <div className="ea-msg ea-msg-system">
        <div className="ea-msg-bubble">
          <Clock size={12} aria-hidden />
          {m.body ?? '(no text)'}
        </div>
      </div>
    )
  }

  const isOut = m.direction === 'outbound'
  const time = formatMessageTime(m.created_at)

  if (isOut) {
    return (
      <div className="ea-msg ea-msg-outbound">
        <div className="ea-msg-bubble">
          {m.body ? <p className="ea-msg-text">{m.body}</p> : null}
          <MessageAttachments urls={urls} messageId={m.id} onImageClick={onImageClick} />
        </div>
        <div className="ea-msg-meta">
          <span>{time}</span>
          <span className="ea-receipt">
            <CheckCheck size={14} aria-hidden />
            {formatDeliveryReceipt(m.delivery_status)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="ea-msg ea-msg-inbound">
      <div className="ea-msg-meta">
        <strong>
          {contactName} · {shopName}
        </strong>
        <span>{time}</span>
      </div>
      <div className="ea-msg-bubble">
        {m.body ?? ''}
        <MessageAttachments urls={urls} messageId={m.id} onImageClick={onImageClick} />
      </div>
    </div>
  )
}
