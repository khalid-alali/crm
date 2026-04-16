import { redirect } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import InternalSidebarNav from '@/components/InternalSidebarNav'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/signin')

  return (
    <div className="flex min-h-screen bg-arctic-50">
      <aside className="w-56 bg-arctic-50 border-r border-arctic-200 flex flex-col">
        <div className="px-5 py-4 border-b border-arctic-200">
          <span className="text-sm font-semibold tracking-wide text-onix-950">Fixlane CRM</span>
        </div>
        <InternalSidebarNav />
        <div className="px-5 py-3 border-t border-arctic-200 text-xs text-onix-400">
          {session.user?.email}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
