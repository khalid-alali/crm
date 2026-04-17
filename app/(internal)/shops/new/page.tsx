import ShopForm from '../ShopForm'

export default async function NewShopPage({
  searchParams,
}: {
  searchParams: Promise<{ account_id?: string; owner_id?: string }>
}) {
  const sp = await searchParams
  const initial = sp.account_id
    ? { account_id: sp.account_id }
    : sp.owner_id
      ? { account_id: sp.owner_id }
      : undefined
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold mb-6">Add New Shop</h1>
      <ShopForm initial={initial} />
    </div>
  )
}
