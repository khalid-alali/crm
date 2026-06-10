import DecisionPageClient from '@/components/labor-rate-approval/DecisionPageClient'

export default async function RequestChangesLaborRatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <DecisionPageClient token={token} mode="changes_requested" />
}
