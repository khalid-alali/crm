import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ShopForm from '../../ShopForm'

export default async function EditShopPage({ params }: { params: { id: string } }) {
  const { data: shop } = await supabaseAdmin
    .from('locations')
    .select('*, program_enrollments(*)')
    .eq('id', params.id)
    .single()

  if (!shop) notFound()

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1 text-sm text-onix-600">
        <Link href="/shops" className="hover:underline">Shops</Link>
        <span>/</span>
        <Link href={`/shops/${shop.id}`} className="hover:underline">{shop.name}</Link>
        <span>/</span>
        <span>Edit</span>
      </div>
      <h1 className="text-lg font-semibold mb-6">Edit Shop</h1>
      <ShopForm initial={shop} locationId={shop.id} />
    </div>
  )
}
