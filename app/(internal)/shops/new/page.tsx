import ShopForm from '../ShopForm'

export default function NewShopPage({ searchParams }: { searchParams: { owner_id?: string } }) {
  const initial = searchParams.owner_id ? { owner_id: searchParams.owner_id } : undefined
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold mb-6">Add New Shop</h1>
      <ShopForm initial={initial} />
    </div>
  )
}
