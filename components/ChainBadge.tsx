'use client'

export default function ChainBadge({ chain }: { chain: string | null }) {
  if (!chain) return null
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 ml-1">
      {chain}
    </span>
  )
}
