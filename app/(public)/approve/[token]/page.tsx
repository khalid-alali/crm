import DecisionPageClient from '@/components/labor-rate-approval/DecisionPageClient'

export default async function ApproveLaborRatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <DecisionPageClient token={token} mode="approve" />
}
