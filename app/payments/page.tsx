'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, DollarSign, ArrowDownRight, ArrowUpRight, Users, Factory, Package, ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Payment {
  id: string
  amount: number
  payment_date: string
  payment_mode: string
  note?: string
  party_name: string
  party_type: string
  party_id: string
  created_at: string
}

interface Party {
  id: string
  name: string
  party_type: string
  current_balance: number
}

export default function PaymentsPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<Payment[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month'>('all')
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'receivables' | 'payables'>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'received' | 'paid'>('all')
  const [paymentModeFilter, setPaymentModeFilter] = useState<'all' | 'cash' | 'upi' | 'bank_transfer' | 'cheque'>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: partiesData } = await supabase
      .from('parties')
      .select('id, name, party_type, current_balance')
      .order('name')

    if (partiesData) {
      // Group parties by name and type to merge multiple statements for the same entity
      const groupedParties = (partiesData as Party[]).reduce((acc, curr) => {
        const key = `${curr.name.toLowerCase().trim()}-${curr.party_type}`
        if (!acc[key]) {
          acc[key] = { ...curr }
        } else {
          acc[key].current_balance = Number(acc[key].current_balance) + Number(curr.current_balance)
        }
        return acc
      }, {} as Record<string, Party>)
      
      setParties(Object.values(groupedParties).sort((a, b) => a.name.localeCompare(b.name)))
    }

    if (paymentsData && partiesData) {
      const formattedPayments = paymentsData.map(payment => {
        const party = partiesData?.find(p => p.id === payment.party_id)
        return {
          ...payment,
          party_name: party?.name || 'Unknown Party',
          party_type: party?.party_type || 'unknown'
        }
      })
      setPayments(formattedPayments)
    }
    setLoading(false)
  }

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.party_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.payment_mode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.note && payment.note.toLowerCase().includes(searchTerm.toLowerCase()))

    let matchesDate = true
    if (dateFilter !== 'all') {
      const paymentDate = new Date(payment.payment_date)
      const today = new Date()
      if (dateFilter === 'this_month') {
        matchesDate = paymentDate.getMonth() === today.getMonth() && paymentDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = paymentDate.getMonth() === lastMonth.getMonth() && paymentDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    let matchesBalance = true
    if (balanceFilter !== 'all') {
      const party = parties.find(p => p.id === payment.party_id)
      if (party) {
        const bal = Number(party.current_balance) || 0
        if (balanceFilter === 'receivables') {
          matchesBalance = party.party_type === 'customer' ? bal > 0 : bal < 0
        } else if (balanceFilter === 'payables') {
          matchesBalance = party.party_type === 'customer' ? bal < 0 : bal > 0
        }
      } else {
        matchesBalance = false
      }
    }

    let matchesType = true
    if (paymentTypeFilter === 'received') {
      matchesType = payment.party_type === 'customer'
    } else if (paymentTypeFilter === 'paid') {
      matchesType = payment.party_type !== 'customer'
    }

    let matchesMode = true
    if (paymentModeFilter !== 'all') {
      matchesMode = payment.payment_mode === paymentModeFilter
    }

    return matchesSearch && matchesDate && matchesBalance && matchesType && matchesMode
  }).sort((a, b) => {
    const dateA = new Date(a.payment_date).getTime()
    const dateB = new Date(b.payment_date).getTime()
    if (dateA !== dateB) {
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    }
    return sortOrder === 'desc' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  let totalReceivables = 0
  let totalPayables = 0

  parties.forEach(p => {
    const bal = Number(p.current_balance) || 0
    if (p.party_type === 'customer') {
      if (bal > 0) totalReceivables += bal
      else if (bal < 0) totalPayables += Math.abs(bal)
    } else {
      if (bal > 0) totalPayables += bal
      else if (bal < 0) totalReceivables += Math.abs(bal)
    }
  })

  const breakdownParties = parties.filter(p => {
    const bal = Number(p.current_balance) || 0

    if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }

    if (balanceFilter === 'all') return true
    if (balanceFilter === 'receivables') {
      return p.party_type === 'customer' ? bal > 0 : bal < 0
    }
    if (balanceFilter === 'payables') {
      return p.party_type === 'customer' ? bal < 0 : bal > 0
    }
    return true
  })

  const getBreakdownTotal = (type: string) => {
    if (balanceFilter === 'all') {
      return breakdownParties.filter(p => p.party_type === type).reduce((sum, p) => sum + Number(p.current_balance), 0)
    }
    return breakdownParties.filter(p => p.party_type === type).reduce((sum, p) => sum + Math.abs(Number(p.current_balance)), 0)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            <span className="truncate">Payments History</span>
          </h2>
        </div>
      </div>

      {/* Outstanding Balances Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6">
        <div 
          onClick={() => setBalanceFilter(prev => prev === 'receivables' ? 'all' : 'receivables')}
          className={`rounded-xl p-4 sm:p-6 border flex items-center justify-between cursor-pointer transition-all duration-200 ${
            balanceFilter === 'receivables' ? 'bg-green-100 border-green-500 ring-2 ring-green-500 shadow-md' :
            balanceFilter === 'payables' ? 'bg-green-50/50 border-green-100 opacity-50 hover:opacity-100' :
            'bg-green-50 border-green-100 hover:bg-green-100 hover:shadow-sm'
          }`}
        >
          <div className="min-w-0 pr-4">
            <p className="text-xs sm:text-sm text-green-700 font-semibold uppercase tracking-wider mb-1 truncate">To Collect <span className="hidden sm:inline">(They Owe Me)</span></p>
            <p className="text-xl sm:text-3xl font-bold text-green-700 truncate">₹{totalReceivables.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-green-100 p-2 sm:p-3 rounded-full flex-shrink-0">
            <ArrowDownRight className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
          </div>
        </div>

        <div 
          onClick={() => setBalanceFilter(prev => prev === 'payables' ? 'all' : 'payables')}
          className={`rounded-xl p-4 sm:p-6 border flex items-center justify-between cursor-pointer transition-all duration-200 ${
            balanceFilter === 'payables' ? 'bg-red-100 border-red-500 ring-2 ring-red-500 shadow-md' :
            balanceFilter === 'receivables' ? 'bg-red-50/50 border-red-100 opacity-50 hover:opacity-100' :
            'bg-red-50 border-red-100 hover:bg-red-100 hover:shadow-sm'
          }`}
        >
          <div className="min-w-0 pr-4">
            <p className="text-xs sm:text-sm text-red-700 font-semibold uppercase tracking-wider mb-1 truncate">To Pay <span className="hidden sm:inline">(I Owe Them)</span></p>
            <p className="text-xl sm:text-3xl font-bold text-red-700 truncate">₹{totalPayables.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-red-100 p-2 sm:p-3 rounded-full flex-shrink-0">
            <ArrowUpRight className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Detailed Breakdowns */}
      {balanceFilter !== 'all' && (
        <div className="bg-white rounded-xl border mb-6 overflow-hidden">
          <div className="p-3 sm:p-4 border-b bg-gray-50">
            <h3 className="font-bold text-sm sm:text-base text-gray-800">Outstanding Balances Breakdown</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
            
            {/* Customers */}
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                <div className="flex items-center gap-2 text-orange-600 min-w-0">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <h4 className="font-bold uppercase text-xs sm:text-sm truncate">Customers</h4>
                </div>
                <span className="font-bold text-sm sm:text-base text-gray-900 flex-shrink-0 ml-2">
                  ₹{getBreakdownTotal('customer').toLocaleString('en-IN')}
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {breakdownParties.filter(p => p.party_type === 'customer').length === 0 && (
                  <p className="text-xs sm:text-sm text-gray-400 italic py-2">No matching balances</p>
                )}
                {breakdownParties.filter(p => p.party_type === 'customer').map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0 gap-2">
                    <Link href={`/all-customers/${encodeURIComponent(p.name)}`} className="text-xs sm:text-sm text-gray-700 hover:text-blue-600 hover:underline truncate pr-2">
                      {p.name}
                    </Link>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${Number(p.current_balance) > 0 ? 'text-green-600' : Number(p.current_balance) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
  
            {/* Factories */}
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                <div className="flex items-center gap-2 text-purple-600 min-w-0">
                  <Factory className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <h4 className="font-bold uppercase text-xs sm:text-sm truncate">Factories</h4>
                </div>
                <span className="font-bold text-sm sm:text-base text-gray-900 flex-shrink-0 ml-2">
                  ₹{getBreakdownTotal('factory').toLocaleString('en-IN')}
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {breakdownParties.filter(p => p.party_type === 'factory').length === 0 && (
                  <p className="text-xs sm:text-sm text-gray-400 italic py-2">No matching balances</p>
                )}
                {breakdownParties.filter(p => p.party_type === 'factory').map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0 gap-2">
                    <Link href={`/statements/${p.id}`} className="text-xs sm:text-sm text-gray-700 hover:text-blue-600 hover:underline truncate pr-2">
                      {p.name}
                    </Link>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${Number(p.current_balance) > 0 ? 'text-red-600' : Number(p.current_balance) < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
  
            {/* Suppliers */}
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                <div className="flex items-center gap-2 text-pink-600 min-w-0">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <h4 className="font-bold uppercase text-xs sm:text-sm truncate">Suppliers</h4>
                </div>
                <span className="font-bold text-sm sm:text-base text-gray-900 flex-shrink-0 ml-2">
                  ₹{getBreakdownTotal('supplier').toLocaleString('en-IN')}
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {breakdownParties.filter(p => p.party_type === 'supplier').length === 0 && (
                  <p className="text-xs sm:text-sm text-gray-400 italic py-2">No matching balances</p>
                )}
                {breakdownParties.filter(p => p.party_type === 'supplier').map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0 gap-2">
                    <Link href={`/statements/${p.id}`} className="text-xs sm:text-sm text-gray-700 hover:text-blue-600 hover:underline truncate pr-2">
                      {p.name}
                    </Link>
                    <span className={`text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${Number(p.current_balance) > 0 ? 'text-red-600' : Number(p.current_balance) < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
  
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by party name, payment mode, or note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none text-sm sm:text-base"
          />
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
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

          <div className="flex bg-white rounded-xl border p-1 overflow-x-auto w-full sm:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => setPaymentTypeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentTypeFilter === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              All Types
            </button>
            <button
              onClick={() => setPaymentTypeFilter('received')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentTypeFilter === 'received' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-green-50'}`}
            >
              Received
            </button>
            <button
              onClick={() => setPaymentTypeFilter('paid')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentTypeFilter === 'paid' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-red-50'}`}
            >
              Paid
            </button>
          </div>

          <div className="flex bg-white rounded-xl border p-1 overflow-x-auto w-full sm:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => setPaymentModeFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentModeFilter === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              All Modes
            </button>
            <button
              onClick={() => setPaymentModeFilter('cash')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentModeFilter === 'cash' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Cash
            </button>
            <button
              onClick={() => setPaymentModeFilter('upi')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentModeFilter === 'upi' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              UPI
            </button>
            <button
              onClick={() => setPaymentModeFilter('bank_transfer')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentModeFilter === 'bank_transfer' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Bank Transfer
            </button>
            <button
              onClick={() => setPaymentModeFilter('cheque')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${paymentModeFilter === 'cheque' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Cheque
            </button>
          </div>

          <div className="flex bg-white rounded-xl border p-1 overflow-x-auto w-full sm:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => setSortOrder('desc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'desc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Newest First
            </button>
            <button
              onClick={() => setSortOrder('asc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'asc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Oldest First
            </button>
          </div>
        </div>
      </div>

      {/* Payments List */}
      {loading ? (
        <div className="animate-pulse space-y-3 sm:space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 sm:p-6 h-20 sm:h-24 border"></div>
          ))}
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-gray-500 bg-white rounded-xl border">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No payment records found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filteredPayments.map(payment => (
            <div key={payment.id} className="relative group bg-white rounded-xl p-3 sm:p-4 border flex flex-row items-center justify-between gap-3 sm:gap-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  payment.party_type === 'customer' ? 'bg-orange-50 text-orange-500' :
                  payment.party_type === 'factory' ? 'bg-purple-50 text-purple-500' :
                  'bg-pink-50 text-pink-500'
                }`}>
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mt-0.5 sm:mt-0">
                    <Link href={`/statements/${payment.party_id}`} className="font-semibold text-base sm:text-lg hover:text-blue-600 hover:underline truncate">
                      {payment.party_name}
                    </Link>
                    <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-gray-100 rounded-full uppercase tracking-wider text-gray-600 font-medium flex-shrink-0">
                      {payment.party_type}
                    </span>
                  </div>
                  {payment.payment_mode && (
                    <p className="text-xs sm:text-sm text-gray-600 capitalize truncate mt-0.5">
                      Mode: {payment.payment_mode.replace('_', ' ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className={`text-base sm:text-xl font-bold ${
                  payment.party_type === 'customer' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {payment.party_type === 'customer' ? '+' : '-'}₹{Math.abs(payment.amount).toLocaleString('en-IN')}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">
                  <span>{new Date(payment.payment_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  {payment.note && (
                    <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Tooltip for Note */}
              {payment.note && (
                <div className="absolute bottom-full right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[calc(100vw-2rem)] md:max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {payment.note}
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