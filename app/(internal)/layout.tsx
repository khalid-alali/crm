import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getAppSession } from '@/lib/app-auth'
import InternalSidebarNav from '@/components/InternalSidebarNav'
import SidebarProfileButton from '@/components/SidebarProfileButton'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/signin')

  return (
    <div className="flex h-screen overflow-hidden bg-arctic-50">
      <aside className="flex h-screen w-56 flex-col border-r border-arctic-200 bg-arctic-50">
        <div className="px-5 py-4 border-b border-arctic-200">
          <Image
            src="/favicon_io/fixlane_logo-removebg-preview.png"
            alt="Fixlane CRM"
            width={140}
            height={28}
            className="h-7 w-auto"
            priority
          />
        </div>
        <InternalSidebarNav />
        <div className="border-t border-arctic-200 px-3 py-3">
          <SidebarProfileButton email={session.user?.email} />
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
