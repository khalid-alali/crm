'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import InternalSidebarNav from '@/components/InternalSidebarNav'
import SidebarProfileButton from '@/components/SidebarProfileButton'

const SIDEBAR_COLLAPSED_KEY = 'fixlane_internal_sidebar_collapsed'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

export default function InternalAppShell({
  userEmail,
  children,
}: {
  userEmail?: string | null
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === 's' && !isTypingTarget(event.target)) {
        event.preventDefault()
        toggleCollapsed()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleCollapsed])

  return (
    <div className="flex h-screen overflow-hidden bg-arctic-50">
      <aside
        className={`flex h-screen flex-col border-r border-arctic-200 bg-arctic-50 transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[52px]' : 'w-56'
        }`}
        aria-label="Main navigation"
      >
        <div
          className={`flex shrink-0 items-center border-b border-arctic-200 ${
            collapsed ? 'justify-center py-2.5' : 'justify-between gap-2 px-3 py-3 pl-4 pr-2'
          }`}
        >
          {!collapsed ? (
            <Image
              src="/favicon_io/fixlane_logo-removebg-preview.png"
              alt="Fixlane CRM"
              width={98}
              height={20}
              className="h-5 w-auto"
              priority
            />
          ) : null}
          <button
            type="button"
            onClick={() => toggleCollapsed()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-onix-600 transition-colors hover:bg-arctic-200/90 hover:text-onix-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            title={collapsed ? 'Expand navigation (⌥S)' : 'Collapse navigation (⌥S)'}
            aria-expanded={!collapsed}
            aria-controls="internal-sidebar-nav"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            ) : (
              <ChevronsLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
        <InternalSidebarNav collapsed={collapsed} />
        <div className={`border-t border-arctic-200 py-3 ${collapsed ? 'px-1.5' : 'px-3'}`}>
          <SidebarProfileButton email={userEmail} collapsed={collapsed} />
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
