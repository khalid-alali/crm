import Link from 'next/link'
import AccountsTable, { type AccountListRow } from '@/components/AccountsTable'
import { supabaseAdmin } from '@/lib/supabase'
import { attachPrimaryContactsToAccounts } from '@/lib/primary-contact'

type AccountQueryRow = {
  id: string
  business_name: string | null
  created_at: string
  locations: { status: string | null }[] | null
}

export default async function AccountsPage() {
  const { data: accountsRaw } = await supabaseAdmin
    .from('accounts')
    .select('id, business_name, created_at, locations(status)')
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

  const accounts: AccountListRow[] = withPrimary.map(a => {
    const locations = (a as { locations?: { status: string | null }[] }).locations ?? []
    const locationCount = locations.length
    const hasNonChurnedLocations = locations.some(l => l.status !== 'inactive')
    return {
      id: a.id,
      business_name: a.business_name?.trim() ? a.business_name : '—',
      primary_owner_name: a.primary_owner_name,
      primary_owner_email: a.primary_owner_email,
      primary_owner_phone: a.primary_owner_phone,
      location_count: locationCount,
      has_non_churned_locations: hasNonChurnedLocations,
    }
  })

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-onix-950">Accounts</h1>
        <Link
          href="/accounts/new"
          className="shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-base font-medium text-white hover:bg-brand-700"
        >
          + Add account
        </Link>
      </div>
      <AccountsTable accounts={accounts} />
    </div>
  )
}
