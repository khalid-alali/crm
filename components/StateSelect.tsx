'use client'

import { US_STATE_CODES_SET, US_STATE_OPTIONS } from '@/lib/us-states'

type Props = {
  value: string
  onChange: (state: string) => void
  className?: string
}

function resolveSelectValue(raw: string): { selectValue: string; extraOption: string | null } {
  const t = (raw ?? '').trim()
  if (!t) return { selectValue: '', extraOption: null }
  if (/^[a-zA-Z]{2}$/.test(t)) {
    const code = t.toUpperCase()
    if (US_STATE_CODES_SET.has(code)) return { selectValue: code, extraOption: null }
    return { selectValue: code, extraOption: code }
  }
  return { selectValue: t, extraOption: t }
}

export default function StateSelect({ value, onChange, className }: Props) {
  const { selectValue, extraOption } = resolveSelectValue(value)
  const baseClass =
    className ??
    'w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white'

  return (
    <select
      value={selectValue}
      onChange={e => onChange(e.target.value)}
      className={baseClass}
    >
      <option value="">—</option>
      {US_STATE_OPTIONS.map(({ code, name }) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))}
      {extraOption && (
        <option value={extraOption}>{extraOption} (saved)</option>
      )}
    </select>
  )
}
