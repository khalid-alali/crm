'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SimpleModal from '@/components/SimpleModal'
import {
  BULK_UPLOAD_OPTIONAL_COLUMNS,
  BULK_UPLOAD_REQUIRED_COLUMNS,
  type BulkUploadContactKind,
  type BulkUploadPreviewRow,
} from '@/lib/account-bulk-location-upload'

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
  totalRows: number
  wouldCreate: number
  wouldSkip: number
  contactsWouldCreate: number
  errors: ImportErrorRow[]
  rows: BulkUploadPreviewRow[]
}

const PREVIEW_ROW_LIMIT = 3

function ColumnTag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-arctic-200 bg-white px-2 py-0.5 font-mono text-[11px] text-onix-700">
      {label}
    </span>
  )
}

function ContactCell({ kind }: { kind: BulkUploadContactKind }) {
  if (!kind) return <span className="text-onix-400">—</span>
  if (kind === 'both') {
    return (
      <span className="inline-flex items-center gap-1 text-onix-600">
        <span className="text-emerald-600" aria-hidden>
          ✓
        </span>
        email, phone
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-onix-600">
      <span className="text-emerald-600" aria-hidden>
        ✓
      </span>
      {kind}
    </span>
  )
}

function ExpectedColumnsHelp() {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-onix-800">Expected columns</h3>
      <div className="space-y-2">
        <div className="rounded-lg border border-arctic-200 bg-arctic-50/80 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-onix-500">Required</p>
          <div className="flex flex-wrap gap-1.5">
            {BULK_UPLOAD_REQUIRED_COLUMNS.map(c => (
              <ColumnTag key={c} label={c} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-arctic-200 bg-arctic-50/80 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-onix-500">Optional</p>
          <div className="flex flex-wrap gap-1.5">
            {BULK_UPLOAD_OPTIONAL_COLUMNS.map(c => (
              <ColumnTag key={c} label={c} />
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-onix-500">
        Common header variations are matched automatically (Zip, Zip Code, LOCATION, Main Phone, etc.). Four-digit
        ZIPs are padded when unambiguous. Rows with email or phone get a location-level contact created. A shop number
        column with 10 digits is treated as phone; shorter values are saved as the shop store number.
      </p>
    </section>
  )
}

export default function BulkLocationUploadModal({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string
  accountName: string
  onClose: () => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
          totalRows: Number(data.totalRows ?? 0),
          wouldCreate: Number(data.wouldCreate ?? 0),
          wouldSkip: Number(data.wouldSkip ?? 0),
          contactsWouldCreate: Number(data.contactsWouldCreate ?? 0),
          errors: Array.isArray(data.errors) ? data.errors : [],
          rows: Array.isArray(data.rows) ? data.rows : [],
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

  const previewSample = useMemo(() => preview?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [], [preview])

  const canSubmit = useMemo(
    () => Boolean(file) && !submitting && !previewing && preview != null && !error && preview.wouldCreate > 0,
    [file, submitting, previewing, preview, error],
  )

  function pickFile() {
    fileInputRef.current?.click()
  }

  function onFileChange(selected: File | null) {
    setFile(selected)
    setError(null)
    setResult(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
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

  const displayName = accountName.trim() || 'this account'
  const importCount = result?.created ?? preview?.wouldCreate ?? 0

  return (
    <SimpleModal
      title="Bulk upload shops"
      subtitle={
        <>
          Adding locations to <span className="font-medium text-onix-700">{displayName}</span> account
        </>
      }
      panelClassName="max-w-2xl"
      onClose={onClose}
      preventClose={submitting}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <ExpectedColumnsHelp />

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          <button
            type="button"
            onClick={pickFile}
            className="flex w-full items-center justify-center rounded-lg border border-dashed border-arctic-300 bg-arctic-50/50 px-4 py-6 text-sm font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-50/40"
          >
            Choose CSV file
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-arctic-200 bg-white text-onix-400"
              aria-hidden
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8M8 17h5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-onix-900">{file.name}</p>
              <p className="text-xs text-onix-500">
                {previewing
                  ? 'Analyzing…'
                  : preview
                    ? `${preview.totalRows} row${preview.totalRows === 1 ? '' : 's'} detected · headers matched`
                    : error
                      ? 'Could not read file'
                      : 'Selected'}
              </p>
            </div>
            <button
              type="button"
              onClick={pickFile}
              disabled={submitting || previewing}
              className="shrink-0 rounded-md border border-arctic-300 bg-white px-2.5 py-1 text-xs font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-50"
            >
              Replace
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {preview && !result && !previewing && (
          <>
            {previewSample.length > 0 && (
              <section>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-onix-800">Preview</h3>
                  <p className="text-[11px] text-onix-500">
                    First {Math.min(PREVIEW_ROW_LIMIT, preview.rows.length)} of {preview.totalRows} row
                    {preview.totalRows === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-arctic-200">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-arctic-200 bg-arctic-50 text-[10px] font-semibold uppercase tracking-wide text-onix-500">
                        <th className="px-3 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Address</th>
                        <th className="px-3 py-2 font-semibold">State</th>
                        <th className="px-3 py-2 font-semibold">ZIP</th>
                        <th className="px-3 py-2 font-semibold">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-arctic-100">
                      {previewSample.map(row => (
                        <tr key={row.row} className="text-onix-800">
                          <td className="max-w-[120px] truncate px-3 py-2 font-medium">{row.name || '—'}</td>
                          <td className="max-w-[160px] truncate px-3 py-2">{row.address || '—'}</td>
                          <td className="px-3 py-2">{row.state || '—'}</td>
                          <td className="px-3 py-2 font-mono">{row.postalCode || '—'}</td>
                          <td className="px-3 py-2">
                            <ContactCell kind={row.contactKind} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-onix-500">Will create</p>
                <p className="mt-0.5 text-lg font-semibold text-onix-900">{preview.wouldCreate}</p>
                <p className="text-[11px] text-onix-500">shops</p>
              </div>
              <div className="rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-onix-500">Will create</p>
                <p className="mt-0.5 text-lg font-semibold text-onix-900">{preview.contactsWouldCreate}</p>
                <p className="text-[11px] text-onix-500">contacts</p>
              </div>
              <div className="rounded-lg border border-arctic-200 bg-arctic-50 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-onix-500">Will skip</p>
                <p className="mt-0.5 text-lg font-semibold text-onix-900">{preview.wouldSkip}</p>
                <p className="text-[11px] text-onix-500">rows</p>
              </div>
            </div>

            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <p className="font-medium">Row errors</p>
                <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {preview.errors.slice(0, 10).map(err => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
                {preview.errors.length > 10 && (
                  <p className="mt-1 text-[11px]">Showing first 10 of {preview.errors.length} errors.</p>
                )}
              </div>
            )}
          </>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p>
              Imported <span className="font-semibold">{result.created}</span> shops
              {result.skipped > 0 ? (
                <>
                  , skipped <span className="font-semibold">{result.skipped}</span>
                </>
              ) : null}
              {(result.contactsCreated ?? 0) > 0 ? (
                <>
                  , <span className="font-semibold">{result.contactsCreated}</span> contacts
                </>
              ) : null}
              .
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-arctic-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          {!result ? (
            <p className="flex items-center gap-1.5 text-[11px] text-onix-500">
              <span className="text-onix-400" aria-hidden>
                ⓘ
              </span>
              Nothing is imported until you confirm.
            </p>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-arctic-300 bg-white px-3 py-1.5 text-xs font-medium text-onix-700 hover:bg-arctic-50 disabled:opacity-60"
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? 'Importing…' : `Import ${importCount} shop${importCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </form>
    </SimpleModal>
  )
}
