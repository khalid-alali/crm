import { Suspense } from 'react'
import PortalOnboardingClient from './PortalOnboardingClient'

function OnboardingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eceef1] text-[#5f6571]">
      Loading your onboarding…
    </div>
  )
}

export default async function PortalOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <PortalOnboardingClient token={token} />
    </Suspense>
  )
}
