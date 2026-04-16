'use client'

import { signOut } from 'next-auth/react'
import { CircleUserRound, LogOut } from 'lucide-react'

export default function SidebarProfileButton({ email }: { email?: string | null }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/signin' })}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-onix-700 transition-colors hover:bg-arctic-100 hover:text-onix-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
      aria-label="Sign out"
      title="Sign out"
    >
      <CircleUserRound className="h-4 w-4 shrink-0 text-onix-500" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{email ?? 'Signed in user'}</span>
      <LogOut className="h-4 w-4 shrink-0 text-onix-500" aria-hidden />
    </button>
  )
}
