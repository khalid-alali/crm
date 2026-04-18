import PortalCapabilitiesClient from './PortalCapabilitiesClient'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PortalCapabilitiesClient token={token} />
}
