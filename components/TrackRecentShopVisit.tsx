'use client'

import { useEffect } from 'react'
import { writeRecentShop } from '@/lib/recent-shops'

type TrackRecentShopVisitProps = {
  shop: {
    id: string
    name: string
    status: string | null
    city: string | null
    state: string | null
  }
}

export default function TrackRecentShopVisit({ shop }: TrackRecentShopVisitProps) {
  useEffect(() => {
    writeRecentShop({
      id: shop.id,
      name: shop.name,
      status: shop.status,
      city: shop.city,
      state: shop.state,
    })
  }, [shop.city, shop.id, shop.name, shop.state, shop.status])

  return null
}
