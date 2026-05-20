'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

type PreviewResult = {
  wouldCreate: number
  wouldSkip: number
  contactsWouldCreate: number
  errors: ImportErrorRow[]
}

function UploadSummary({
  createCount,
  skipCount,
  contactCount,
  errors,
  createLabel,
}: {
  createCount: number
  skipCount: number
  contactCount: number
  errors: ImportErrorRow[]
  createLabel: string
}) {
  return (
    <>
      <p>
        {createLabel} <span className="font-semibold">{createCount}</span> shops, skipped{' '}
        <span className="font-semibold">{skipCount}</span>
        {contactCount > 0 ? (
          <>
            , location contacts <span className="font-semibold">{contactCount}</span>
          </>
        ) : null}
        .
      </p>
      {errors.length > 0 && (
        <div>
          <p className="mt-2 font-medium text-red-700">Row errors</p>
          <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-red-700">
            {errors.slice(0, 20).map(err => (
              <li key={`${err.row}-${err.message}`}>
                Row {err.row}: {err.message}
              </li>
            ))}
          </ul>
          {errors.length > 20 && (
            <p className="mt-1 text-[11px] text-red-600">Showing first 20 of {errors.length} errors.</p>
          )}
        </div>
      )}
    </>
  )
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
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const loadPreview = useCallback(
    async (selected: File) => {
      setPreviewing(true)
      setError(null)
      setPreview(null)
      try {
        const fd = new FormData()
        fd.append('file', selected)
        const res = await fetch(`/api/accounts/${accountId}/bulk-upload/preview`, {
          method: 'POST',
          body: fd,
        })
        const data = (await res.json().catch(() => ({}))) as PreviewResult & { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Could not preview CSV')
        setPreview({
          wouldCreate: Number(data.wouldCreate ?? 0),
          wouldSkip: Number(data.wouldSkip ?? 0),
          contactsWouldCreate: Number(data.contactsWouldCreate ?? 0),
          errors: Array.isArray(data.errors) ? data.errors : [],
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not preview CSV')
      } finally {
        setPreviewing(false)
      }
    },
    [accountId],
  )

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    void loadPreview(file)
  }, [file, loadPreview])

  const canSubmit = useMemo(
    () => Boolean(file) && !submitting && !previewing && preview != null && !error,
    [file, submitting, previewing, preview, error],
  )

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
        {previewing && <p className="text-xs text-onix-500">Analyzing CSV…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {preview && !result && (
          <div className="rounded border border-arctic-200 bg-arctic-50 p-2.5 text-xs text-onix-700">
            <UploadSummary
              createCount={preview.wouldCreate}
              skipCount={preview.wouldSkip}
              contactCount={preview.contactsWouldCreate}
              errors={preview.errors}
              createLabel="Created"
            />
          </div>
        )}

        {result && (
          <div className="rounded border border-arctic-200 bg-arctic-50 p-2.5 text-xs text-onix-700">
            <UploadSummary
              createCount={result.created}
              skipCount={result.skipped}
              contactCount={result.contactsCreated ?? 0}
              errors={result.errors}
              createLabel="Created"
            />
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
          {!result && (
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? 'Importing…' : 'Import CSV'}
            </button>
          )}
        </div>
      </form>
    </SimpleModal>
  )
}
