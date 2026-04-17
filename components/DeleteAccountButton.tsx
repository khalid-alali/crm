'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DeleteAccountButton({
  accountId,
  accountName,
  canDelete,
  className,
  label = 'Delete',
}: {
  accountId: string
  accountName: string
  canDelete: boolean
  className?: string
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || 'Delete failed')
      }
      router.push('/accounts')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canDelete}
        title={!canDelete ? 'Cannot delete accounts with linked contracts.' : undefined}
        className={
          className ??
          'text-sm text-red-600 hover:underline disabled:text-onix-400 disabled:no-underline'
        }
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="presentation"
          onClick={() => {
            if (!deleting) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-arctic-200 px-5 py-4">
              <h2 id="delete-account-title" className="text-sm font-semibold text-onix-950">
                Delete account
              </h2>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-onix-400 hover:text-onix-600 disabled:opacity-40"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <p className="text-sm text-onix-800">
                Are you sure you want to delete <span className="font-medium">{accountName}</span>?
                This permanently removes the account and unlinks it from any shops. This cannot be
                undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-arctic-100 px-5 py-4">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setOpen(false)}
                className="rounded border border-arctic-300 px-3 py-1.5 text-sm hover:bg-arctic-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
