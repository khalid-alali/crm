import { redirect } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import InternalAppShell from '@/components/InternalAppShell'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/signin')

  return <InternalAppShell userEmail={session.user?.email}>{children}</InternalAppShell>
}
