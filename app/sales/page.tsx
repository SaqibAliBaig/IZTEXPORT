'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, TrendingUp, ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Sale {
  id: string
  product_type: string
  quantity: number
  rate: number
  total_amount: number
  sale_date: string
  note?: string
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
      <div className="flex justify-between items-center mb-6 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            <span className="truncate">Sales History</span>
          </h2>
        </div>
        <Link
          href="/sales/add"
          className="bg-black text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors flex-shrink-0 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Record Sale</span>
          <span className="sm:hidden">Record</span>
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by customer or product type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none text-sm sm:text-base"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex bg-white rounded-xl border p-1 overflow-x-auto w-full sm:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
        </div>
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-3 sm:p-6 h-20 sm:h-24 border"></div>
          ))}
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-gray-500 bg-white rounded-xl border">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No sales records found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filteredSales.map(sale => (
            <div key={sale.id} className="relative group bg-white rounded-xl p-3 sm:p-4 border flex flex-row items-center justify-between gap-3 sm:gap-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-base sm:text-lg truncate">{sale.customer_name}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {sale.quantity.toLocaleString('en-IN')} x {sale.product_type} <span className="hidden sm:inline">@ ₹{sale.rate.toLocaleString('en-IN')}/pc</span>
                  </p>
                  <p className="text-[10px] sm:hidden text-gray-500 mt-0.5 truncate">
                    @ ₹{sale.rate.toLocaleString('en-IN')}/pc
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-base sm:text-xl font-bold text-green-600">
                  ₹{sale.total_amount.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">
                  <span>{new Date(sale.sale_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  {sale.note && (
                    <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Tooltip for Note */}
              {sale.note && (
                <div className="absolute bottom-full right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[calc(100vw-2rem)] md:max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {sale.note}
                  {/* Tooltip downward arrow */}
                  <div className="absolute top-full right-6 md:left-1/2 md:right-auto md:-translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}