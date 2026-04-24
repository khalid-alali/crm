'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartColumn, CarFront, House, MapPinned, Store, Users } from 'lucide-react'

const navItems = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/shops', label: 'Shops', icon: Store },
  { href: '/tesla', label: 'Tesla', icon: CarFront },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/map', label: 'Map', icon: MapPinned },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
]

export default function InternalSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
      {navItems.map(item => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-arctic-100 hover:text-onix-950 ${
              isActive ? 'font-semibold text-onix-950 bg-arctic-100' : 'font-normal text-onix-800'
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? 'text-brand-700' : 'text-onix-600'}`} aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
