/**
 * Shop/Admin matching audit + manual remediation helper.
 *
 * Usage:
 *   npx tsx tools/audit-shop-admin-matching.ts
 *   npx tsx tools/audit-shop-admin-matching.ts --mapping scripts/data/shop-id-manual-updates.json
 *   npx tsx tools/audit-shop-admin-matching.ts --mapping scripts/data/shop-id-manual-updates.json --apply
 */
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: path.join(__dirname, '../.env.local') })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type OwnerRow = { name: string | null; email: string | null } | null
type ContractRow = {
  doc_storage_path: string | null
}
type LocationRow = {
  id: string
  name: string
  city: string | null
  state: string | null
  owner_id: string | null
  motherduck_shop_id: string | null
  primary_contact_email: string | null
  owners: OwnerRow | OwnerRow[] | null
  contract_locations: Array<{ contracts: ContractRow | ContractRow[] | null }> | null
}

type MappingRow = {
  location_id: string
  motherduck_shop_id: string
  reason?: string
}

type SuggestedMatch = {
  target_location_id: string
  target_name: string
  proposed_shop_id: string
  current_holder_location_id: string
  current_holder_name: string
  score: number
  reasons: string[]
}

function clean(value: string | null | undefined): string | null {
  const s = (value ?? '').trim()
  return s === '' ? null : s
}

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function ownerFromLocation(row: LocationRow): OwnerRow {
  if (!row.owners) return null
  if (Array.isArray(row.owners)) return row.owners[0] ?? null
  return row.owners
}

function bestEmail(row: LocationRow): string | null {
  const owner = ownerFromLocation(row)
  const ownerEmail = clean(owner?.email)?.toLowerCase() ?? null
  if (ownerEmail) return ownerEmail
  return clean(row.primary_contact_email)?.toLowerCase() ?? null
}

function hasContractPdf(row: LocationRow): boolean {
  return (row.contract_locations ?? []).some(link => {
    const contracts = Array.isArray(link.contracts) ? link.contracts : link.contracts ? [link.contracts] : []
    return contracts.some(contract => Boolean(contract.doc_storage_path))
  })
}

function contractPdfCount(row: LocationRow): number {
  return (row.contract_locations ?? []).reduce((count, link) => {
    const contracts = Array.isArray(link.contracts) ? link.contracts : link.contracts ? [link.contracts] : []
    return count + contracts.reduce((inner, contract) => inner + (contract.doc_storage_path ? 1 : 0), 0)
  }, 0)
}

function locationLabel(row: LocationRow): string {
  const where = [row.city, row.state].filter(Boolean).join(', ')
  return `${row.name}${where ? ` (${where})` : ''}`
}

function scoreSuggestedMove(target: LocationRow, holder: LocationRow): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (target.owner_id && holder.owner_id && target.owner_id === holder.owner_id) {
    score += 90
    reasons.push('same owner_id')
  }

  const targetEmail = bestEmail(target)
  const holderEmail = bestEmail(holder)
  if (targetEmail && holderEmail && targetEmail === holderEmail) {
    score += 80
    reasons.push('same best email')
  }

  const targetName = norm(target.name)
  const holderName = norm(holder.name)
  if (targetName && holderName && (targetName.includes(holderName) || holderName.includes(targetName))) {
    score += 35
    reasons.push('name overlap')
  }

  const targetCity = norm(target.city)
  const holderCity = norm(holder.city)
  const targetState = norm(target.state)
  const holderState = norm(holder.state)
  if (targetCity && holderCity && targetCity === holderCity) {
    score += 25
    reasons.push('same city')
  }
  if (targetState && holderState && targetState === holderState) {
    score += 10
    reasons.push('same state')
  }

  return { score, reasons }
}

async function fetchLocations(): Promise<LocationRow[]> {
  const { data, error } = await supabase
    .from('locations')
    .select(`
      id,
      name,
      city,
      state,
      owner_id,
      motherduck_shop_id,
      primary_contact_email,
      owners(name, email),
      contract_locations(
        contracts(doc_storage_path)
      )
    `)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as LocationRow[]
}

function buildReviewSuggestions(locations: LocationRow[]): SuggestedMatch[] {
  const needsShopId = locations.filter(row => hasContractPdf(row) && !row.motherduck_shop_id)
  const hasShopId = locations.filter(row => Boolean(row.motherduck_shop_id))

  const suggestions: SuggestedMatch[] = []
  for (const target of needsShopId) {
    const candidates = hasShopId
      .map(holder => {
        const { score, reasons } = scoreSuggestedMove(target, holder)
        return { holder, score, reasons }
      })
      .filter(candidate => candidate.score >= 110)
      .sort((a, b) => b.score - a.score)

    const top = candidates[0]
    if (!top || !top.holder.motherduck_shop_id) continue
    suggestions.push({
      target_location_id: target.id,
      target_name: target.name,
      proposed_shop_id: top.holder.motherduck_shop_id,
      current_holder_location_id: top.holder.id,
      current_holder_name: top.holder.name,
      score: top.score,
      reasons: top.reasons,
    })
  }

  return suggestions.sort((a, b) => b.score - a.score)
}

function printAnomalySection(title: string, rows: LocationRow[]) {
  console.log(`\n${title}: ${rows.length}`)
  if (rows.length === 0) return
  for (const row of rows.slice(0, 60)) {
    const owner = ownerFromLocation(row)
    const ownerName = clean(owner?.name) ?? '—'
    const email = bestEmail(row) ?? '—'
    const pdfCount = contractPdfCount(row)
    console.log(
      `- ${locationLabel(row)} | owner=${ownerName} | email=${email} | shop_id=${row.motherduck_shop_id ?? '—'} | pdf_contracts=${pdfCount}`,
    )
  }
  if (rows.length > 60) console.log(`... truncated ${rows.length - 60} more rows`)
}

function printSuggestionSection(suggestions: SuggestedMatch[]) {
  console.log(`\nManual review suggestions: ${suggestions.length}`)
  if (suggestions.length === 0) return
  for (const suggestion of suggestions.slice(0, 60)) {
    console.log(
      `- target=${suggestion.target_name} (${suggestion.target_location_id.slice(0, 8)}) -> shop_id=${suggestion.proposed_shop_id} currently_on=${suggestion.current_holder_name} (${suggestion.current_holder_location_id.slice(0, 8)}) | score=${suggestion.score} | reasons=${suggestion.reasons.join(', ')}`,
    )
  }
  if (suggestions.length > 60) console.log(`... truncated ${suggestions.length - 60} more suggestions`)
}

function loadMappingFile(mappingPathArg: string): MappingRow[] {
  const resolved = path.resolve(mappingPathArg)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Mapping file not found: ${resolved}`)
  }
  const raw = fs.readFileSync(resolved, 'utf-8')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Mapping file must be a JSON array')
  }
  return parsed.map(row => {
    const r = row as Record<string, unknown>
    const location_id = clean(String(r.location_id ?? ''))
    const motherduck_shop_id = clean(String(r.motherduck_shop_id ?? ''))
    const reason = clean(typeof r.reason === 'string' ? r.reason : null) ?? undefined
    if (!location_id || !motherduck_shop_id) throw new Error('Each mapping row must include location_id and motherduck_shop_id')
    return { location_id, motherduck_shop_id, reason }
  })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function writeActivity(locationId: string, subject: string, body: string) {
  await supabase.from('activity_log').insert({
    location_id: locationId,
    type: 'admin_shop_match',
    subject,
    body,
    sent_by: 'script:audit-shop-admin-matching',
  })
}

async function applyMappings(rows: MappingRow[], apply: boolean) {
  if (rows.length === 0) {
    console.log('\nNo manual mappings provided.')
    return
  }
  console.log(`\nManual mappings: ${rows.length}${apply ? ' (applying)' : ' (dry-run)'}`)

  for (const row of rows) {
    const shopId = row.motherduck_shop_id.trim()
    if (!isUuid(shopId)) {
      console.log(`- skip ${row.location_id}: invalid motherduck_shop_id (${shopId})`)
      continue
    }

    const { data: target, error: targetErr } = await supabase
      .from('locations')
      .select('id, name')
      .eq('id', row.location_id)
      .maybeSingle()
    if (targetErr) throw targetErr
    if (!target) {
      console.log(`- skip ${row.location_id}: location not found`)
      continue
    }

    const { data: holder, error: holderErr } = await supabase
      .from('locations')
      .select('id, name')
      .eq('motherduck_shop_id', shopId)
      .maybeSingle()
    if (holderErr) throw holderErr

    const movingFrom = holder && holder.id !== target.id ? holder : null
    console.log(
      `- ${target.name} (${target.id.slice(0, 8)}) <= ${shopId}${movingFrom ? ` (moves from ${movingFrom.name})` : ''}${row.reason ? ` | ${row.reason}` : ''}`,
    )

    if (!apply) continue

    if (movingFrom) {
      const { error } = await supabase
        .from('locations')
        .update({ motherduck_shop_id: null })
        .eq('id', movingFrom.id)
      if (error) throw error
      await writeActivity(
        movingFrom.id,
        'Admin shop id removed',
        `Shop id ${shopId} moved to ${target.name} (${target.id}).`,
      )
    }

    const { error: updateErr } = await supabase
      .from('locations')
      .update({ motherduck_shop_id: shopId })
      .eq('id', target.id)
    if (updateErr) throw updateErr

    await writeActivity(
      target.id,
      'Admin shop id set',
      `Shop id set to ${shopId}${movingFrom ? ` (moved from ${movingFrom.name}).` : '.'}`,
    )
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const mappingArgIndex = process.argv.indexOf('--mapping')
  const mappingPath = mappingArgIndex >= 0 ? process.argv[mappingArgIndex + 1] : null

  const locations = await fetchLocations()
  const withPdfNoShopId = locations.filter(row => hasContractPdf(row) && !row.motherduck_shop_id)
  const withShopIdNoPdf = locations.filter(row => row.motherduck_shop_id && !hasContractPdf(row))
  const suggestions = buildReviewSuggestions(locations)

  printAnomalySection('Shops with contract PDF but no admin shop id', withPdfNoShopId)
  printAnomalySection('Shops with admin shop id but no contract PDF', withShopIdNoPdf)
  printSuggestionSection(suggestions)

  const outPath = path.join(__dirname, '../scripts/data/shop-admin-match-review.json')
  const payload = {
    generated_at: new Date().toISOString(),
    counts: {
      with_pdf_no_shop_id: withPdfNoShopId.length,
      with_shop_id_no_pdf: withShopIdNoPdf.length,
      suggestions: suggestions.length,
    },
    suggestions,
  }
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(`\nWrote review queue: ${outPath}`)

  if (!mappingPath) {
    console.log('\nNo mapping file provided. To apply manual fixes:')
    console.log('  npx tsx tools/audit-shop-admin-matching.ts --mapping scripts/data/shop-id-manual-updates.json --apply')
    return
  }

  const mappings = loadMappingFile(mappingPath)
  await applyMappings(mappings, apply)
  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write updates.')
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
