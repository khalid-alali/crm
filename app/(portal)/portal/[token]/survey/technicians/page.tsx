import TechnicianInviteClient from './TechnicianInviteClient'

export default async function TechnicianInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <TechnicianInviteClient token={token} />
}
