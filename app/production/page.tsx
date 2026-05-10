'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus, Search, Factory, Calendar, Box, Shirt, DollarSign, ArrowLeft, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface ProductionRecord {
  id: string
  product_type: string
  output_quantity: number
  output_unit: string
  rate_per_unit: number
  total_value: number
  paid_amount: number
  due_amount: number
  production_date: string
  note?: string
  created_at: string
  factory: { name: string }
}

export default function ProductionPage() {
  const router = useRouter()
  const [records, setRecords] = useState<ProductionRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'last_month'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProduction()
  }, [])

  const fetchProduction = async () => {
    const { data } = await supabase
      .from('production_records')
      .select(`
        *,
        factory:parties!production_records_factory_id_fkey(name)
      `)
      .order('production_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) setRecords(data)
    setLoading(false)
  }

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.factory?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.product_type.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    if (dateFilter !== 'all') {
      const productionDate = new Date(record.production_date)
      const today = new Date()
      if (dateFilter === 'today') {
        matchesDate = productionDate.getDate() === today.getDate() && 
                      productionDate.getMonth() === today.getMonth() && 
                      productionDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'this_week') {
        const currentDay = today.getDay() || 7 // 1-7, where Monday is 1
        const startOfWeek = new Date(today)
        startOfWeek.setDate(startOfWeek.getDate() - (currentDay - 1))
        startOfWeek.setHours(0, 0, 0, 0)
        matchesDate = productionDate >= startOfWeek
      } else if (dateFilter === 'this_month') {
        matchesDate = productionDate.getMonth() === today.getMonth() && productionDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = productionDate.getMonth() === lastMonth.getMonth() && productionDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    return matchesSearch && matchesDate
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const totalValue = filteredRecords.reduce((sum, record) => sum + record.total_value, 0)
  const totalQuantity = filteredRecords.reduce((sum, record) => sum + record.output_quantity, 0)

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl p-3 sm:p-6 h-20 sm:h-24 border"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
            <Shirt className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            <span className="truncate">Production History</span>
          </h2>
        </div>
        <Link
          href="/production/add"
          className="bg-black text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors flex-shrink-0 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Add Production</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-xl p-3 sm:p-4 border flex items-center justify-between transition-all hover:border-gray-400 hover:shadow-md">
          <div>
            <p className="text-xs sm:text-sm text-gray-500">Total Value</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900">₹{totalValue.toLocaleString('en-IN')}</p>
          </div>
          <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 flex-shrink-0" />
        </div>
        <div className="bg-white rounded-xl p-3 sm:p-4 border flex items-center justify-between transition-all hover:border-gray-400 hover:shadow-md">
          <div>
            <p className="text-xs sm:text-sm text-gray-500">Total Garments Produced</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900">{totalQuantity.toLocaleString('en-IN')}</p>
          </div>
          <Shirt className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500 flex-shrink-0" />
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by factory or product..."
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
              onClick={() => setDateFilter('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'today' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('this_week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'this_week' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              This Week
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

      <div className="grid gap-3 sm:gap-4">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-8 sm:py-12 text-gray-500 bg-white rounded-xl border">
            <Box className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No production records found</p>
          </div>
        ) : (
          filteredRecords.map(record => (
            <div key={record.id} className="relative group bg-white rounded-xl border p-3 sm:p-4 transition-all hover:border-gray-400 hover:shadow-md flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
              <div className="flex justify-between items-start sm:w-full">
                <div className="min-w-0 pr-2">
                  <h3 className="font-semibold text-base sm:text-lg truncate">{record.factory?.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 truncate mt-0.5">
                    {record.output_quantity} {record.output_unit} of {record.product_type}
                  </p>
                  {record.rate_per_unit > 0 && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                      Rate: ₹{record.rate_per_unit}/{record.output_unit}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base sm:text-xl font-bold text-blue-600">₹{record.total_value.toLocaleString('en-IN')}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] sm:text-xs text-gray-500">
                    <span>{format(new Date(record.production_date), 'dd MMM yyyy')}</span>
                    {record.note && (
                      <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </div>
              
              {/* Tooltip for Note */}
              {record.note && (
                <div className="absolute bottom-full right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[calc(100vw-2rem)] md:max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {record.note}
                  {/* Tooltip downward arrow */}
                  <div className="absolute top-full right-6 md:left-1/2 md:right-auto md:-translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}