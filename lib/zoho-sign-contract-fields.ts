/**
 * Maps CRM values → Zoho Sign template `field_text_data` keys.
 * Keys must match each text field’s **Field label** in the Zoho Sign template editor.
 * Override via env if your template labels differ.
 */
export type ZohoContractPrefillInput = {
  standardLaborRate: number | string | null | undefined
  warrantyLaborRate: number | string | null | undefined
  shopOwnerName: string
  shopOwnerEmail: string
  headOfBusinessDevelopmentName: string
  headOfBusinessDevelopmentEmail: string
}

function strRate(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v).trim()
}

function fieldLabels() {
  return {
    laborRate:
      process.env.ZOHO_SIGN_FIELD_LABOR_RATE?.trim() || 'Shop customer pay labor rate $',
    laborRateLegacy:
      process.env.ZOHO_SIGN_FIELD_LABOR_RATE_LEGACY?.trim() || 'Labor Rate',
    warrantyRate:
      process.env.ZOHO_SIGN_FIELD_WARRANTY_LABOR?.trim() || 'Shop warranty labor rate $',
    warrantyRateLegacy:
      process.env.ZOHO_SIGN_FIELD_WARRANTY_LABOR_LEGACY?.trim() || 'Warranty Rate',
    shopOwnerName:
      process.env.ZOHO_SIGN_FIELD_SHOP_OWNER_NAME?.trim() || 'Shop Owner Name',
    shopOwnerEmail:
      process.env.ZOHO_SIGN_FIELD_SHOP_OWNER_EMAIL?.trim() || 'Shop owner email',
    bdName:
      process.env.ZOHO_SIGN_FIELD_BD_NAME?.trim() || 'Head of Business Development Name',
    bdEmail:
      process.env.ZOHO_SIGN_FIELD_BD_EMAIL?.trim() || 'Head of Business Development Email',
  }
}

/** Build `field_text_data` for POST …/templates/{id}/createdocument */
export function buildZohoSignContractFieldTextData(input: ZohoContractPrefillInput): Record<string, string> {
  const L = fieldLabels()
  const labor = strRate(input.standardLaborRate)
  const warranty = strRate(input.warrantyLaborRate)
  const out: Record<string, string> = {
    // Send both current and legacy labels so either Zoho template version is satisfied.
    [L.laborRate]: labor,
    [L.laborRateLegacy]: labor,
    [L.warrantyRate]: warranty,
    [L.warrantyRateLegacy]: warranty,
    [L.shopOwnerName]: input.shopOwnerName.trim(),
    [L.shopOwnerEmail]: input.shopOwnerEmail.trim(),
    [L.bdName]: input.headOfBusinessDevelopmentName.trim(),
    [L.bdEmail]: input.headOfBusinessDevelopmentEmail.trim(),
  }

  const raw = process.env.ZOHO_SIGN_EXTRA_FIELD_TEXT_JSON?.trim()
  if (raw) {
    try {
      const extra = JSON.parse(raw) as Record<string, unknown>
      for (const [k, v] of Object.entries(extra)) {
        if (typeof k === 'string' && k && v != null) out[k] = String(v)
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  return out
}

/** Read labor / warranty from a completed request (labels vary by template version). */
export function laborRateFromSignedFields(fields: Record<string, string>): string | null {
  const L = fieldLabels()
  const keys = ['standard_labor_rate', 'Labor Rate', L.laborRate]
  for (const k of keys) {
    const v = fields[k]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

export function warrantyRateFromSignedFields(fields: Record<string, string>): string | null {
  const L = fieldLabels()
  const keys = ['warranty_labor_rate', 'Warranty Rate', L.warrantyRate]
  for (const k of keys) {
    const v = fields[k]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}
