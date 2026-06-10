export function laborRateNotificationsDomain(): string {
  return (
    (process.env.RESEND_NOTIFICATIONS_DOMAIN ?? 'notifications.fixlane.com').trim() ||
    'notifications.fixlane.com'
  )
}

/** Stable RFC Message-ID for the root email in an approval thread. */
export function formatLaborRateThreadMessageId(approvalId: string): string {
  return `<labor-rate-${approvalId}@${laborRateNotificationsDomain()}>`
}

export function laborRateThreadHeaders(options: {
  existingThreadMessageId?: string | null
  approvalId?: string
}): { headers: Record<string, string>; newThreadMessageId: string | null } {
  const { existingThreadMessageId, approvalId } = options

  if (existingThreadMessageId) {
    return {
      headers: {
        'In-Reply-To': existingThreadMessageId,
        References: existingThreadMessageId,
      },
      newThreadMessageId: null,
    }
  }

  if (approvalId) {
    const messageId = formatLaborRateThreadMessageId(approvalId)
    return {
      headers: { 'Message-ID': messageId },
      newThreadMessageId: messageId,
    }
  }

  return { headers: {}, newThreadMessageId: null }
}
