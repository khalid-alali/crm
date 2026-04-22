import { redirect } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import InternalSidebarNav from '@/components/InternalSidebarNav'
import SidebarProfileButton from '@/components/SidebarProfileButton'
import GlobalSearch from '@/components/GlobalSearch'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/signin')

  return (
    <div className="flex h-screen overflow-hidden bg-arctic-50">
      <aside className="flex h-screen w-56 flex-col border-r border-arctic-200 bg-arctic-50">
        <div className="px-5 py-4 border-b border-arctic-200">
          <span className="text-sm font-semibold tracking-wide text-onix-950">Fixlane CRM</span>
        </div>
        <InternalSidebarNav />
        <div className="border-t border-arctic-200 px-3 py-3">
          <SidebarProfileButton email={session.user?.email} />
        </div>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-end border-b border-arctic-200 bg-arctic-50 px-5">
          <GlobalSearch />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  )
}
