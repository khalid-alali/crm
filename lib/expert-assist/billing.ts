/**
 * Flat $60 for first 20 minutes, then $2.50 per additional minute (ceil).
 * Matches Expert Assist SOW pricing table.
 */
export function computeConsultBillUsd(billableSeconds: number): { cents: number; label: string } {
  if (!Number.isFinite(billableSeconds) || billableSeconds <= 0) {
    return { cents: 0, label: '$0.00' }
  }
  const firstTierSeconds = 1200
  const baseCents = 6000
  if (billableSeconds <= firstTierSeconds) {
    return { cents: baseCents, label: '$60.00' }
  }
  const extraSeconds = billableSeconds - firstTierSeconds
  const extraMinutes = Math.ceil(extraSeconds / 60)
  const extraCents = extraMinutes * 250
  const total = baseCents + extraCents
  const dollars = total / 100
  return { cents: total, label: `$${dollars.toFixed(2)}` }
}
