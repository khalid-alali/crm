import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getAppSession } from '@/lib/app-auth'
import { canDeleteContracts } from '@/lib/contract-permissions'
import AccountDetailShell, {
  type ActivityEntry,
  type ContractRow,
  type LocationRow,
  type AccountRow,
} from './AccountDetailShell'
import { getSignedContractDocUrl } from '@/lib/contract-documents'

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getAppSession()
  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('id, business_name, notes, created_at')
    .eq('id', id)
    .single()

  if (!account) notFound()

  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name, chain_name, city, state, status, program_enrollments(program, status)')
    .eq('account_id', id)
    .order('name')

  const { data: contracts } = await supabaseAdmin
    .from('contracts')
    .select(
      'id, counterparty_company, counterparty_name, legal_entity_name, status, signing_date, zoho_sign_request_id, doc_url, doc_storage_bucket, doc_storage_path',
    )
    .eq('account_id', id)
    .order('created_at', { ascending: false })

  const contractsWithDocUrls = await Promise.all(
    (contracts ?? []).map(async contract => ({
      ...contract,
      doc_url: await getSignedContractDocUrl(contract),
    })),
  )

  const programCounts: Record<string, number> = {}
  for (const loc of locations ?? []) {
    for (const e of loc.program_enrollments ?? []) {
      if (e.status === 'active') {
        programCounts[e.program] = (programCounts[e.program] ?? 0) + 1
      }
    }
  }

  const locationList = (locations ?? []) as LocationRow[]
  const locationIds = locationList.map(l => l.id)
  const nameByLocationId = Object.fromEntries(locationList.map(l => [l.id, l.name]))

  let activityEntries: ActivityEntry[] = []
  if (locationIds.length > 0) {
    const { data: rawActivity } = await supabaseAdmin
      .from('activity_log')
      .select('id, location_id, type, subject, body, to_email, sent_by, created_at')
      .in('location_id', locationIds)
      .order('created_at', { ascending: false })
      .limit(75)

    activityEntries = (rawActivity ?? []).map(row => ({
      ...row,
      locations: { name: nameByLocationId[row.location_id] ?? '—' },
    }))
  }

  const accountRow: AccountRow = {
    id: account.id,
    business_name: account.business_name?.trim() ? account.business_name : '—',
    notes: account.notes,
  }

  const contractRows: ContractRow[] = contractsWithDocUrls.map(c => ({
    id: c.id,
    counterparty_company: c.counterparty_company,
    counterparty_name: c.counterparty_name,
    legal_entity_name: c.legal_entity_name,
    status: c.status ?? 'draft',
    signing_date: c.signing_date,
    doc_url: c.doc_url,
  }))

  const missingBusinessName = !account.business_name?.trim()

  return (
    <AccountDetailShell
      account={accountRow}
      locations={locationList}
      contracts={contractRows}
      activityEntries={activityEntries}
      programCounts={programCounts}
      allowContractDelete={canDeleteContracts(session?.user?.email)}
      missingBusinessName={missingBusinessName}
    />
  )
}
