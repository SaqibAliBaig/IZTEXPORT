'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Package, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Purchase {
  id: string
  cloth_name: string
  cloth_color: string
  color_image_url: string
  meters: number
  rate_per_meter: number
  total_amount: number
  purchase_date: string
  supplier_name: string
}

export default function PurchasesPage() {
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPurchases()
  }, [])

  const fetchPurchases = async () => {
    const { data: purchasesData } = await supabase
      .from('cloth_purchases')
      .select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: suppliersData } = await supabase
      .from('parties')
      .select('id, name')
      .eq('party_type', 'supplier')

    if (purchasesData) {
      const formattedPurchases = purchasesData.map(purchase => {
        const supplier = suppliersData?.find(s => s.id === purchase.supplier_id)
        return {
          ...purchase,
          supplier_name: supplier?.name || 'Unknown Supplier'
        }
      })
      setPurchases(formattedPurchases)
    }
    setLoading(false)
  }

  const filteredPurchases = purchases.filter(purchase => {
    const matchesSearch = purchase.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.cloth_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (purchase.cloth_color && purchase.cloth_color.toLowerCase().includes(searchTerm.toLowerCase()))

    let matchesDate = true
    if (dateFilter !== 'all') {
      const purchaseDate = new Date(purchase.purchase_date)
      const today = new Date()
      if (dateFilter === 'this_month') {
        matchesDate = purchaseDate.getMonth() === today.getMonth() && purchaseDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = purchaseDate.getMonth() === lastMonth.getMonth() && purchaseDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    return matchesSearch && matchesDate
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            Purchases History
          </h2>
        </div>
        <Link
          href="/purchases/add"
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Purchase
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex bg-white rounded-xl border p-1 overflow-x-auto">
          <button
            onClick={() => setDateFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All Time
          </button>
          <button
            onClick={() => setDateFilter('this_month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'this_month' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            This Month
          </button>
          <button
            onClick={() => setDateFilter('last_month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'last_month' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Last Month
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by supplier, cloth name or color..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      {/* Purchases List */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-24 border"></div>
          ))}
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No purchase records found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPurchases.map(purchase => (
            <div key={purchase.id} className="bg-white rounded-xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex items-center gap-4">
                {purchase.color_image_url ? (
                  <img src={purchase.color_image_url} alt={purchase.cloth_color} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border" />
                ) : (
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-blue-500" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{purchase.supplier_name}</h3>
                  <p className="text-sm text-gray-600">
                    {purchase.meters.toLocaleString('en-IN')}m x {purchase.cloth_name} {purchase.cloth_color && `(${purchase.cloth_color})`} @ ₹{purchase.rate_per_meter.toLocaleString('en-IN')}/m
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-red-600">
                  ₹{purchase.total_amount.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(purchase.purchase_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}