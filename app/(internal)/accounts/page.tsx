import AccountsTable, { type AccountListRow } from '@/components/AccountsTable'
import { supabaseAdmin } from '@/lib/supabase'
import { attachPrimaryContactsToAccounts } from '@/lib/primary-contact'

type AccountQueryRow = {
  id: string
  business_name: string | null
  created_at: string
  locations: { count: number }[] | null
}

export default async function AccountsPage() {
  const { data: accountsRaw } = await supabaseAdmin
    .from('accounts')
    .select('id, business_name, created_at, locations(count)')
    .order('business_name')

  const withPrimary = await attachPrimaryContactsToAccounts(
    supabaseAdmin,
    ((accountsRaw ?? []) as AccountQueryRow[]).map(a => ({
      id: a.id,
      business_name: a.business_name ?? '',
      created_at: a.created_at,
      locations: a.locations,
    })),
  )

  const accounts: AccountListRow[] = withPrimary.map(a => ({
    id: a.id,
    business_name: a.business_name?.trim() ? a.business_name : '—',
    primary_owner_name: a.primary_owner_name,
    primary_owner_email: a.primary_owner_email,
    primary_owner_phone: a.primary_owner_phone,
    location_count: Number((a as { locations?: { count: number }[] }).locations?.[0]?.count ?? 0),
  }))

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-4">Accounts</h1>
      <AccountsTable accounts={accounts} />
    </div>
  )
}
