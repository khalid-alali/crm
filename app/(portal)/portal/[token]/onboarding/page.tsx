import PortalOnboardingClient from './PortalOnboardingClient'

export default async function PortalOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PortalOnboardingClient token={token} />
}
