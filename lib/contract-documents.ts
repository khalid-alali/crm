import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase'
import { downloadRequestPdf } from './zohosign'

export const CONTRACT_DOCS_BUCKET =
  process.env.SUPABASE_CONTRACT_DOCS_BUCKET?.trim() || 'contract-docs'

const ensuredBuckets = new Set<string>()

type ContractDocFields = {
  id?: string | null
  status?: string | null
  zoho_sign_request_id?: string | null
  doc_url?: string | null
  doc_storage_bucket?: string | null
  doc_storage_path?: string | null
}

async function ensureContractDocsBucket(client: SupabaseClient, bucket: string) {
  if (ensuredBuckets.has(bucket)) return

  const { data: buckets, error } = await client.storage.listBuckets()
  if (error) throw error

  if (!buckets.some(b => b.name === bucket)) {
    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf'],
    })
    if (createError && !createError.message.toLowerCase().includes('already')) {
      throw createError
    }
  }

  ensuredBuckets.add(bucket)
}

function contractDocPath(contractId: string, requestId: string): string {
  return `contracts/${contractId}/zoho-${requestId}.pdf`
}

export async function syncContractPdfFromZoho(params: {
  contractId: string
  requestId: string
  existingAccessToken?: string
  client?: SupabaseClient
}) {
  const client = params.client ?? (supabaseAdmin as unknown as SupabaseClient)
  const bucket = CONTRACT_DOCS_BUCKET
  const storagePath = contractDocPath(params.contractId, params.requestId)

  await ensureContractDocsBucket(client, bucket)
  const pdfBytes = await downloadRequestPdf(params.requestId, params.existingAccessToken)

  const { error: uploadError } = await client.storage.from(bucket).upload(storagePath, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError

  const { error: updateError } = await client
    .from('contracts')
    .update({
      doc_storage_bucket: bucket,
      doc_storage_path: storagePath,
      doc_uploaded_at: new Date().toISOString(),
      doc_source: 'zoho',
    })
    .eq('id', params.contractId)
  if (updateError) throw updateError

  return { bucket, storagePath }
}

export async function getSignedContractDocUrl(
  contract: ContractDocFields,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  const createSignedStorageUrl = async (bucket: string, storagePath: string): Promise<string | null> => {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds)
    if (!error && data?.signedUrl) return data.signedUrl
    return null
  }

  if (contract.doc_storage_path) {
    const bucket = contract.doc_storage_bucket || CONTRACT_DOCS_BUCKET
    const signedUrl = await createSignedStorageUrl(bucket, contract.doc_storage_path)
    if (signedUrl) return signedUrl
  }

  const hasSignedContractWithoutStoredPdf =
    contract.status === 'signed' && contract.id && contract.zoho_sign_request_id

  if (hasSignedContractWithoutStoredPdf) {
    try {
      const { bucket, storagePath } = await syncContractPdfFromZoho({
        contractId: contract.id as string,
        requestId: contract.zoho_sign_request_id as string,
      })
      const signedUrl = await createSignedStorageUrl(bucket, storagePath)
      if (signedUrl) return signedUrl
    } catch {
      // Fall back to any existing URL if PDF sync fails.
    }
  }

  return contract.doc_url ?? null
}
