'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import SimpleModal from '@/components/SimpleModal'

type ImportErrorRow = {
  row: number
  message: string
}

type ImportResult = {
  created: number
  skipped: number
  contactsCreated?: number
  errors: ImportErrorRow[]
}

export default function BulkLocationUploadModal({
  accountId,
  onClose,
}: {
  accountId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const canSubmit = useMemo(() => Boolean(file) && !submitting, [file, submitting])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch(`/api/accounts/${accountId}/bulk-upload`, {
        method: 'POST',
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as
        | { error?: string }
        | (ImportResult & { error?: string })
      if (!res.ok) throw new Error(data.error ?? 'Bulk upload failed')

      setResult({
        created: Number((data as ImportResult).created ?? 0),
        skipped: Number((data as ImportResult).skipped ?? 0),
        contactsCreated: Number((data as ImportResult).contactsCreated ?? 0),
        errors: Array.isArray((data as ImportResult).errors) ? (data as ImportResult).errors : [],
      })
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SimpleModal title="Bulk upload shops" onClose={onClose} preventClose={submitting}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-onix-600">
          Required columns (any common header name works): <span className="font-medium">address</span>,{' '}
          <span className="font-medium">state</span>, <span className="font-medium">ZIP</span> (
          <span className="font-mono">Zip</span>, <span className="font-mono">Zip code</span>, etc.). Optional:{' '}
          <span className="font-medium">shop name</span> (
          <span className="font-mono">Name</span>, <span className="font-mono">LOCATION</span>, …),{' '}
          <span className="font-medium">city</span>, <span className="font-medium">email</span>,{' '}
          <span className="font-medium">phone</span> (
          <span className="font-mono">Main Phone</span>, <span className="font-mono">Phone</span>, …). When email
          and/or phone is present, a <span className="font-medium">location-level contact</span> is created for
          that shop. Four-digit ZIPs (leading zero dropped) are padded when unambiguous.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e => {
            setFile(e.target.files?.[0] ?? null)
            setError(null)
            setResult(null)
          }}
          className="w-full rounded border border-arctic-300 px-2 py-1.5 text-sm"
        />
        {file && <p className="text-xs text-onix-500">Selected: {file.name}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {result && (
          <div className="rounded border border-arctic-200 bg-arctic-50 p-2.5 text-xs text-onix-700">
            <p>
              Created <span className="font-semibold">{result.created}</span> shops, skipped{' '}
              <span className="font-semibold">{result.skipped}</span>
              {result.contactsCreated != null && result.contactsCreated > 0 ? (
                <>
                  , location contacts <span className="font-semibold">{result.contactsCreated}</span>
                </>
              ) : null}
              .
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-red-700">Row errors</p>
                <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-red-700">
                  {result.errors.slice(0, 20).map(err => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
                {result.errors.length > 20 && (
                  <p className="mt-1 text-[11px] text-red-600">Showing first 20 of {result.errors.length} errors.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-arctic-300 px-3 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-60"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </form>
    </SimpleModal>
  )
}
