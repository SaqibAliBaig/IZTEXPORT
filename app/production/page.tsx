'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus, Search, Factory, Calendar, Box, Shirt, DollarSign, ArrowLeft } from 'lucide-react'
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
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-32"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shirt className="w-6 h-6" />
            Production History
          </h2>
        </div>
        <Link
          href="/production/add"
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Production
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border flex items-center justify-between transition-all hover:border-gray-400 hover:shadow-md">
          <div>
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold text-gray-900">₹{totalValue.toLocaleString('en-IN')}</p>
          </div>
          <DollarSign className="w-8 h-8 text-green-500" />
        </div>
        <div className="bg-white rounded-xl p-4 border flex items-center justify-between transition-all hover:border-gray-400 hover:shadow-md">
          <div>
            <p className="text-sm text-gray-500">Total Garments Produced</p>
            <p className="text-2xl font-bold text-gray-900">{totalQuantity.toLocaleString('en-IN')}</p>
          </div>
          <Shirt className="w-8 h-8 text-indigo-500" />
        </div>
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

        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by factory or product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Box className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No production records found</p>
          </div>
        ) : (
          filteredRecords.map(record => (
            <div key={record.id} className="bg-white rounded-xl border p-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{record.factory?.name}</h3>
                  <p className="text-gray-600">
                    {record.output_quantity} {record.output_unit} of {record.product_type}
                  </p>
                  {record.rate_per_unit > 0 && (
                    <p className="text-sm text-gray-500">
                      Rate: ₹{record.rate_per_unit}/{record.output_unit}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">₹{record.total_value.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                {format(new Date(record.production_date), 'dd MMM yyyy')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}