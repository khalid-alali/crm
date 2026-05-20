'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MergeFieldPreview, MergePreviewResponse } from '@/lib/location-merge/types'
import { formatDisplayValue } from '@/lib/location-merge/values'

type Props = {
  locationAId: string
  locationBId: string
  onClose: () => void
  onMerged: (primaryId: string) => void
}

function fieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ModalShell({ onClose, children, footer }: { onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <ModalPanel onClose={onClose} footer={footer}>{children}</ModalPanel>
    </div>
  )
}

function ModalPanel({ onClose, children, footer }: { onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="location-merge-title"
      className="relative flex max-h-[min(90vh,800px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-arctic-200 bg-white shadow-xl"
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-arctic-100 px-4 py-3">
        <h2 id="location-merge-title" className="text-base font-semibold text-onix-950">Merge locations</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-lg text-onix-400 hover:bg-arctic-50" aria-label="Close">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
      {footer}
    </div>
  )
}

function FieldRow({ field, override, onOverride }: { field: MergeFieldPreview; override: unknown; onOverride: (value: string) => void }) {
  const value = override !== undefined ? override : field.default
  return (
    <tr className={field.type === 'conflict' ? 'bg-amber-50' : undefined}>
      <td className="px-2 py-1.5 font-medium text-onix-800">{fieldLabel(field.key)}</td>
      <td className="px-2 py-1.5 text-onix-600">{formatDisplayValue(field.primary)}</td>
      <td className="px-2 py-1.5 text-onix-600">{formatDisplayValue(field.secondary)}</td>
      <td className="px-2 py-1.5">
        <input type="text" className="w-full rounded border border-arctic-300 px-2 py-1 text-sm"
          value={value === null || value === undefined ? '' : String(value)} onChange={e => onOverride(e.target.value)} />
      </td>
    </tr>
  )
}

function FieldTable({ fields, fieldOverrides, setFieldOverrides }: {
  fields: MergeFieldPreview[]
  fieldOverrides: Record<string, string>
  setFieldOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-arctic-200 text-onix-500">
            <th className="px-2 py-1">Field</th><th className="px-2 py-1">Primary</th><th className="px-2 py-1">Secondary</th><th className="px-2 py-1">Result</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <FieldRow key={f.key} field={f} override={fieldOverrides[f.key]}
              onOverride={v => setFieldOverrides(prev => ({ ...prev, [f.key]: v }))} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RelationalSummary({ preview }: { preview: MergePreviewResponse }) {
  return (
    <section className="rounded-lg border border-arctic-200 bg-arctic-50/50 px-3 py-2 text-onix-700">
      <h3 className="mb-1 font-semibold text-onix-900">Relational data</h3>
      <p>Contacts: {preview.relational.contacts.moving} will be moved · {preview.relational.contacts.deduped} duplicate(s) deduped</p>
      <p>Contracts: {preview.relational.contracts.moving} will be linked to the survivor</p>
      <p>Activity: {preview.relational.activityEntries} entries will be combined</p>
      <p>Tasks: {preview.relational.openTasks} open task(s) will be moved
        {preview.relational.openTasksDeduped > 0 ? ` · ${preview.relational.openTasksDeduped} duplicate(s) dropped` : ''}</p>
      {preview.relational.programs.map(p => (
        <p key={p.program}>{p.program}: {p.resolution.replace(/_/g, ' ')}
          {p.checklist ? ` · checklist ${p.checklist.primaryFieldsPopulated}/${p.checklist.secondaryFieldsPopulated} fields, ${p.checklist.conflicts} conflict(s)` : ''}</p>
      ))}
    </section>
  )
}

export default function LocationMergeModal({ locationAId, locationBId, onClose, onMerged }: Props) {
  const [preview, setPreview] = useState<MergePreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({})
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [legalAck, setLegalAck] = useState(false)
  const [disqualifiedAck, setDisqualifiedAck] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)

  const loadPreview = useCallback(async (primaryId?: string, secondaryId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const body = primaryId && secondaryId ? { primaryId, secondaryId } : { locationAId, locationBId }
      const res = await fetch('/api/locations/merge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as MergePreviewResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Preview failed')
      setPreview(data)
      setFieldOverrides({})
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setLoading(false)
    }
  }, [locationAId, locationBId])

  useEffect(() => { void loadPreview() }, [loadPreview])

  const conflicts = useMemo(() => (preview?.fields ?? []).filter(f => f.type === 'conflict'), [preview])
  const autofills = useMemo(() => (preview?.fields ?? []).filter(f => f.type === 'autofill'), [preview])
  const unchanged = useMemo(() => (preview?.fields ?? []).filter(f => f.type === 'unchanged'), [preview])

  function swapPrimarySecondary() {
    if (!preview) return
    void loadPreview(preview.secondary.id, preview.primary.id)
  }

  async function commit() {
    if (!preview) return
    setCommitting(true)
    setError(null)
    try {
      const overrides: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fieldOverrides)) { if (v !== '') overrides[k] = v }
      const res = await fetch('/api/locations/merge/commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: preview.primary.id, secondaryId: preview.secondary.id, fieldOverrides: overrides,
          legalEntityAcknowledged: legalAck, disqualifiedAcknowledged: disqualifiedAck,
          previewSnapshot: { primaryUpdatedAt: preview.primary.updatedAt, secondaryUpdatedAt: preview.secondary.updatedAt },
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; locationId?: string }
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')
      const id = data.locationId ?? preview.primary.id
      setSuccessId(id)
      onMerged(id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Merge failed')
      setConfirmOpen(false)
    } finally {
      setCommitting(false)
    }
  }

  const canCommit = preview && (!preview.relational.contracts.legalEntityWarning || legalAck) &&
    (!preview.warnings.requiresDisqualifiedConfirmation || disqualifiedAck)

  const footer = !successId && preview ? (
    <div className="flex justify-end gap-2 border-t border-arctic-100 px-4 py-3">
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-onix-600 hover:bg-arctic-100">Cancel</button>
      <button type="button" disabled={!canCommit || loading || committing} onClick={() => setConfirmOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50">Merge locations…</button>
    </div>
  ) : undefined

  return (
    <ModalShell onClose={onClose} footer={footer}>
      {loading && <p className="text-sm text-onix-600">Loading merge preview…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successId && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="font-medium text-green-900">Locations merged successfully.</p>
          <Link href={`/shops/${successId}`} className="mt-2 inline-block text-brand-700 underline">Open surviving shop</Link>
        </div>
      )}
      {!loading && preview && !successId && (
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border-2 border-brand-500 bg-brand-50/40 p-3">
              <p className="text-xs font-medium uppercase text-brand-700">Primary (survives)</p>
              <p className="font-semibold text-onix-950">{preview.primary.name}</p>
              <p className="text-onix-600">Score: {preview.primary.score}</p>
            </div>
            <div className="rounded-lg border border-arctic-200 p-3">
              <p className="text-xs font-medium uppercase text-onix-500">Secondary (deleted)</p>
              <p className="font-semibold text-onix-950">{preview.secondary.name}</p>
              <p className="text-onix-600">Score: {preview.secondary.score}</p>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <p className="text-onix-600">{preview.autoPickReason}</p>
              <button type="button" onClick={swapPrimarySecondary} className="text-brand-700 underline">Swap primary ⇄ secondary</button>
            </div>
          </div>
          {preview.warnings.disqualifiedInvolved && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <input type="checkbox" checked={disqualifiedAck} onChange={e => setDisqualifiedAck(e.target.checked)} />
              <span>One or both shops are churned/disqualified. Confirm status fields carry over as previewed.</span>
            </label>
          )}
          {preview.relational.contracts.legalEntityWarning && (
            <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <input type="checkbox" checked={legalAck} onChange={e => setLegalAck(e.target.checked)} />
              <span>Contracts use different legal entity names ({preview.relational.contracts.legalEntityNames.join(' · ')}). I have verified this merge.</span>
            </label>
          )}
          {conflicts.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-onix-900">Conflicts ({conflicts.length})</h3>
              <FieldTable fields={conflicts} fieldOverrides={fieldOverrides} setFieldOverrides={setFieldOverrides} />
            </section>
          )}
          {autofills.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-onix-900">Auto-filled from secondary ({autofills.length})</h3>
              <ul className="space-y-1 text-onix-700">
                {autofills.map(f => (<li key={f.key}>✓ {fieldLabel(f.key)}: {formatDisplayValue(f.default)}</li>))}
              </ul>
            </section>
          )}
          <RelationalSummary preview={preview} />
          {unchanged.length > 0 && (
            <section>
              <button type="button" className="text-brand-700 underline" onClick={() => setShowUnchanged(s => !s)}>
                {showUnchanged ? 'Hide' : 'Show'} all {unchanged.length} unchanged fields
              </button>
              {showUnchanged && <FieldTable fields={unchanged} fieldOverrides={fieldOverrides} setFieldOverrides={setFieldOverrides} />}
            </section>
          )}
        </div>
      )}
      {confirmOpen && preview && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h3 className="font-semibold text-onix-950">Confirm merge</h3>
            <p className="mt-2 text-sm text-onix-700">Merge <strong>{preview.secondary.name}</strong> into <strong>{preview.primary.name}</strong>? This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={committing} className="px-3 py-1.5 text-onix-600">Cancel</button>
              <button type="button" disabled={committing} onClick={() => void commit()} className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">{committing ? 'Merging…' : 'Yes, merge'}</button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
