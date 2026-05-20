import Papa from 'papaparse'
import { coerceUsZip5OrNull, getPostalCodeError, normalizePostalCode } from '@/lib/postal-code'

/** Raw CSV row — headers vary by export (e.g. LOCATION, Zip, Main Phone). */
export type BulkUploadCsvRow = Record<string, string | undefined>

export type BulkUploadRowError = {
  row: number
  message: string
}

export type BulkUploadContactKind = 'email' | 'phone' | 'both' | null

export type BulkUploadPreviewRow = {
  row: number
  name: string
  address: string
  city: string | null
  state: string
  postalCode: string
  contactKind: BulkUploadContactKind
  outcome: 'create' | 'skip_duplicate' | 'skip_error'
  message?: string
}

export type BulkUploadPreview = {
  totalRows: number
  wouldCreate: number
  wouldSkip: number
  contactsWouldCreate: number
  errors: BulkUploadRowError[]
  rows: BulkUploadPreviewRow[]
}

/** Shown in the bulk upload UI — must match parser aliases below. */
export const BULK_UPLOAD_REQUIRED_COLUMNS = ['address', 'state', 'zip'] as const
export const BULK_UPLOAD_OPTIONAL_COLUMNS = ['name', 'city', 'email', 'phone', 'shop number'] as const

const SHOP_NUMBER_HEADER_ALIASES = [
  'shop #',
  'shop number',
  'store number',
  'store_number',
  'store no',
  'shop no',
]

export type BulkUploadCommitResult = BulkUploadPreview & {
  created: number
  skipped: number
  contactsCreated: number
}

function compact(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\u00a0/g, ' ').trim()
}

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '')
}

function normalizeHeaderKey(h: string): string {
  return stripBom(h)
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** One logical field, first matching column wins. */
function getFromNorm(norm: Record<string, string>, headerAliases: string[]): string {
  for (const alias of headerAliases) {
    const v = norm[normalizeHeaderKey(alias)]
    if (v) return v
  }
  return ''
}

/**
 * Shop-number column: exactly 10 digits → phone (when no dedicated phone column).
 * Fewer than 10 digits → locations.store_number. Other values stay as store_number text.
 */
export function classifyShopNumberColumnValue(raw: string): {
  contactPhone: string
  storeNumber: string | null
} {
  const trimmed = compact(raw)
  if (!trimmed) return { contactPhone: '', storeNumber: null }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) {
    return { contactPhone: digits, storeNumber: null }
  }
  if (digits.length > 0 && digits.length < 10) {
    return { contactPhone: '', storeNumber: trimmed }
  }
  return { contactPhone: '', storeNumber: trimmed }
}

export function bulkUploadContactKind(email: string, phone: string): BulkUploadContactKind {
  const hasEmail = Boolean(email.trim())
  const hasPhone = Boolean(phone.trim())
  if (hasEmail && hasPhone) return 'both'
  if (hasEmail) return 'email'
  if (hasPhone) return 'phone'
  return null
}

function rowToNormalized(csvRow: BulkUploadCsvRow): Record<string, string> {
  const norm: Record<string, string> = {}
  for (const [k, v] of Object.entries(csvRow)) {
    norm[normalizeHeaderKey(k)] = compact(v)
  }
  return norm
}

/** US ZIP: accept 5, ZIP+4, 9 digits, or 4-digit (leading zero dropped in Excel). */
export function coerceZipForBulkUpload(raw: unknown): string {
  const fromLib = coerceUsZip5OrNull(raw)
  if (fromLib) return fromLib
  const digits = compact(raw).replace(/\D/g, '')
  if (digits.length === 4 && /^\d{4}$/.test(digits)) return digits.padStart(5, '0')
  return normalizePostalCode(raw)
}

const REQUIRED_HEADER_GROUPS: string[][] = [
  ['address', 'street', 'address line 1'],
  ['state', 'st'],
  ['zip code', 'zip', 'postal code', 'postcode'],
]

export function csvHasRequiredColumns(fields: (string | undefined)[]): boolean {
  const normHeaders = new Set(fields.filter(Boolean).map(f => normalizeHeaderKey(f!)))
  return REQUIRED_HEADER_GROUPS.every(group => group.some(a => normHeaders.has(normalizeHeaderKey(a))))
}

export function buildBulkUploadDedupKey(address: string, state: string, postalCode: string): string {
  return `${address.toLowerCase()}|${state.toUpperCase()}|${postalCode}`
}

export type ParsedBulkUploadCsv = {
  data: BulkUploadCsvRow[]
  headers: string[]
}

export function parseBulkUploadCsv(csvText: string): ParsedBulkUploadCsv | { error: string } {
  const parsed = Papa.parse<BulkUploadCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    return { error: `Invalid CSV: ${parsed.errors[0]?.message ?? 'parse error'}` }
  }
  const headers = parsed.meta.fields ?? []
  if (!csvHasRequiredColumns(headers)) {
    return {
      error:
        'CSV must include columns for address, state, and ZIP/postal code. Accepted examples: Address, State, Zip or Zip code.',
    }
  }
  return { data: parsed.data, headers }
}

type NormalizedBulkRow = {
  rowNumber: number
  address: string
  state: string
  postalCode: string
  city: string | null
  name: string
  contactEmail: string
  contactPhone: string
  storeNumber: string | null
}

function normalizeBulkRow(csvRow: BulkUploadCsvRow, rowNumber: number): NormalizedBulkRow | BulkUploadRowError {
  const norm = rowToNormalized(csvRow)
  const address = getFromNorm(norm, ['address', 'street', 'address line 1'])
  const state = getFromNorm(norm, ['state', 'st']).toUpperCase()
  const postalCodeRaw = getFromNorm(norm, ['zip code', 'zip', 'postal code', 'postcode'])
  const postalCode = coerceZipForBulkUpload(postalCodeRaw)
  const city = getFromNorm(norm, ['city']) || null
  const explicitName = getFromNorm(norm, ['name', 'location', 'shop name', 'shop'])
  const contactEmail = getFromNorm(norm, ['email', 'e-mail'])
  let contactPhone = getFromNorm(norm, [
    'main phone',
    'phone',
    'mobile',
    'cell',
    'telephone',
    'published google number/marchex',
  ])
  const shopNumberRaw = getFromNorm(norm, SHOP_NUMBER_HEADER_ALIASES)
  let storeNumber: string | null = null
  if (shopNumberRaw) {
    const fromShopCol = classifyShopNumberColumnValue(shopNumberRaw)
    if (!contactPhone.trim() && fromShopCol.contactPhone) {
      contactPhone = fromShopCol.contactPhone
    }
    if (fromShopCol.storeNumber) {
      storeNumber = fromShopCol.storeNumber
    }
  }

  if (!address) return { row: rowNumber, message: 'Address is required.' }
  if (!state) return { row: rowNumber, message: 'State is required.' }
  if (!postalCode) return { row: rowNumber, message: 'ZIP / postal code is required.' }
  const postalCodeError = getPostalCodeError(postalCode)
  if (postalCodeError) return { row: rowNumber, message: postalCodeError }

  const name = explicitName || `Shop - ${address}`
  return {
    rowNumber,
    address,
    state,
    postalCode,
    city,
    name,
    contactEmail,
    contactPhone,
    storeNumber,
  }
}

export function previewBulkLocationUpload(
  parsed: ParsedBulkUploadCsv,
  existingKeys: Set<string>,
): BulkUploadPreview {
  const errors: BulkUploadRowError[] = []
  const rows: BulkUploadPreviewRow[] = []
  let wouldCreate = 0
  let wouldSkip = 0
  let contactsWouldCreate = 0
  const seenKeys = new Set(existingKeys)

  for (let i = 0; i < parsed.data.length; i += 1) {
    const csvRow = (parsed.data[i] ?? {}) as BulkUploadCsvRow
    const rowNumber = i + 2
    const normalized = normalizeBulkRow(csvRow, rowNumber)

    if ('message' in normalized) {
      errors.push(normalized)
      wouldSkip += 1
      rows.push({
        row: rowNumber,
        name: '',
        address: '',
        city: null,
        state: '',
        postalCode: '',
        contactKind: null,
        outcome: 'skip_error',
        message: normalized.message,
      })
      continue
    }

    const dedupKey = buildBulkUploadDedupKey(normalized.address, normalized.state, normalized.postalCode)
    const contactKind = bulkUploadContactKind(normalized.contactEmail, normalized.contactPhone)

    if (seenKeys.has(dedupKey)) {
      wouldSkip += 1
      rows.push({
        row: rowNumber,
        name: normalized.name,
        address: normalized.address,
        city: normalized.city,
        state: normalized.state,
        postalCode: normalized.postalCode,
        contactKind,
        outcome: 'skip_duplicate',
        message: 'Duplicate address on this account (or repeated in CSV).',
      })
      continue
    }

    seenKeys.add(dedupKey)
    wouldCreate += 1
    if (contactKind) contactsWouldCreate += 1
    rows.push({
      row: rowNumber,
      name: normalized.name,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      postalCode: normalized.postalCode,
      contactKind,
      outcome: 'create',
    })
  }

  return {
    totalRows: parsed.data.length,
    wouldCreate,
    wouldSkip,
    contactsWouldCreate,
    errors,
    rows,
  }
}

export function buildExistingBulkUploadKeys(
  locations: { address_line1: string | null; state: string | null; postal_code: string | null }[],
): Set<string> {
  return new Set(
    locations
      .map(loc => {
        const address = compact(loc.address_line1)
        const state = compact(loc.state)
        const postalCode = coerceZipForBulkUpload(loc.postal_code)
        if (!address || !state || !postalCode || getPostalCodeError(postalCode)) return null
        return buildBulkUploadDedupKey(address, state, postalCode)
      })
      .filter(Boolean) as string[],
  )
}

export type BulkUploadRowForCommit = NormalizedBulkRow

export function* iterBulkUploadRowsForCommit(parsed: ParsedBulkUploadCsv): Generator<
  BulkUploadRowForCommit | BulkUploadRowError
> {
  for (let i = 0; i < parsed.data.length; i += 1) {
    const csvRow = (parsed.data[i] ?? {}) as BulkUploadCsvRow
    const rowNumber = i + 2
    yield normalizeBulkRow(csvRow, rowNumber)
  }
}
