'use client'

import { useEffect } from 'react'

type SimpleModalProps = {
  title: string
  titleId?: string
  onClose: () => void
  /** When true, Escape, backdrop click, and the close button do not dismiss (e.g. while saving). */
  preventClose?: boolean
  children: React.ReactNode
}

/** Centered overlay dialog (backdrop + panel). Closes on Escape and backdrop click. */
export default function SimpleModal({
  title,
  titleId = 'simple-modal-title',
  onClose,
  preventClose = false,
  children,
}: SimpleModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, preventClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => {
        if (!preventClose) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-xl border border-arctic-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-arctic-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-onix-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={preventClose}
            className="rounded p-1 text-lg leading-none text-onix-400 hover:bg-arctic-50 hover:text-onix-700 disabled:pointer-events-none disabled:opacity-40"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
