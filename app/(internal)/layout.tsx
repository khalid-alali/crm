import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAppSession } from '@/lib/app-auth'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession()
  if (!session) redirect('/api/auth/signin')

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <span className="text-sm font-semibold tracking-wide text-gray-800">Fixlane CRM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <Link href="/shops" className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">
            Shops
          </Link>
          <Link href="/map" className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">
            Map
          </Link>
          <Link href="/owners" className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">
            Owners
          </Link>
        </nav>
        <div className="px-5 py-3 border-t border-gray-200 text-xs text-gray-400">
          {session.user?.email}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
