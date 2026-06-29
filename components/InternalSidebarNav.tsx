'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChartColumn,
  House,
  ListTodo,
  Mail,
  MapPinned,
  MessageSquare,
  Phone,
  Store,
  Users,
} from 'lucide-react'
import GlobalSearch from '@/components/GlobalSearch'
import { TeslaMark, VinfastMark } from '@/components/SidebarBrandIcons'

const navItems = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/shops', label: 'Shops', icon: Store },
  { href: '/consults', label: 'Consults', icon: MessageSquare },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/tesla', label: 'Tesla', icon: TeslaMark },
  { href: '/vinfast', label: 'VinFast', icon: VinfastMark },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/map', label: 'Map', icon: MapPinned },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/settings/email-templates', label: 'Email templates', icon: Mail },
]

export default function InternalSidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      id="internal-sidebar-nav"
      className={`flex-1 space-y-1 py-4 text-sm ${collapsed ? 'px-1.5' : 'px-3'}`}
    >
      {navItems.map(item => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`flex items-center rounded-md transition-colors hover:bg-arctic-100 hover:text-onix-950 ${
              collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'
            } ${isActive ? 'font-semibold text-onix-950 bg-arctic-100' : 'font-normal text-onix-800'}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand-700' : 'text-onix-600'}`} aria-hidden />
            <span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
          </Link>
        )
      })}
      <div className="mt-2 border-t border-arctic-200 pt-2">
        <GlobalSearch
          className={
            collapsed
              ? 'w-full justify-center border-0 bg-transparent p-0 shadow-none'
              : 'w-full justify-between px-3 py-2 shadow-none'
          }
          triggerVariant={collapsed ? 'icon-only' : 'default'}
        />
      </div>
    </nav>
  )
}
