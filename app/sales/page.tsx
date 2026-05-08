'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, TrendingUp, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Sale {
  id: string
  product_type: string
  quantity: number
  rate: number
  total_amount: number
  sale_date: string
  created_at: string
  customer_name: string
}

export default function SalesPage() {
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSales()
  }, [])

  const fetchSales = async () => {
    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: customersData } = await supabase
      .from('parties')
      .select('id, name')
      .eq('party_type', 'customer')

    if (salesData) {
      const formattedSales = salesData.map(sale => {
        const customer = customersData?.find(c => c.id === sale.customer_id)
        return {
          ...sale,
          customer_name: customer?.name || 'Unknown Customer'
        }
      })
      setSales(formattedSales)
    }
    setLoading(false)
  }

  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.product_type.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    if (dateFilter !== 'all') {
      const saleDate = new Date(sale.sale_date)
      const today = new Date()
      if (dateFilter === 'this_month') {
        matchesDate = saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = saleDate.getMonth() === lastMonth.getMonth() && saleDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    return matchesSearch && matchesDate
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Sales History
          </h2>
        </div>
        <Link
          href="/sales/add"
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Sale
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
            placeholder="Search by customer or product type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-24 border"></div>
          ))}
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No sales records found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSales.map(sale => (
            <div key={sale.id} className="bg-white rounded-xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{sale.customer_name}</h3>
                  <p className="text-sm text-gray-600">
                    {sale.quantity.toLocaleString('en-IN')} x {sale.product_type} @ ₹{sale.rate.toLocaleString('en-IN')}/pc
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-green-600">
                  ₹{sale.total_amount.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(sale.sale_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}