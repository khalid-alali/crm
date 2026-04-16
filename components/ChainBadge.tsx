'use client'

export default function ChainBadge({ chain }: { chain: string | null }) {
  if (!chain) return null
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-brand-50 text-brand-800 border border-brand-200 ml-1">
      {chain}
    </span>
  )
}
