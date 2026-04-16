/** Known franchise / chain labels (detection + shop form dropdown). */
export const KNOWN_CHAINS = [
  'Midas', 'AAMCO', 'Stress Free Auto Care', 'Firestone',
  'Jiffy Lube', 'Pep Boys', 'Mavis', 'Monro', 'Meineke',
] as const

export type KnownChain = (typeof KNOWN_CHAINS)[number]

export function detectChain(shopName: string): string | null {
  const lower = shopName.toLowerCase()
  return KNOWN_CHAINS.find(c => lower.includes(c.toLowerCase())) ?? null
}
