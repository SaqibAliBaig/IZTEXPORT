'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Search, FileText, Users, Factory, Package, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Party {
  id: string
  name: string
  party_type: string
  current_balance: number
  phone: string
  created_at: string
  note?: string
}

export default function StatementsPage() {
  const router = useRouter()
  const [parties, setParties] = useState<Party[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    fetchParties()
  }, [])

  const fetchParties = async () => {
    let query = supabase
      .from('parties')
      .select('*')
      .order('created_at', { ascending: true })

    if (typeFilter !== 'all') {
      query = query.eq('party_type', typeFilter)
    }

    const { data } = await query
    if (data) {
      setParties(data)
    }
  }

  useEffect(() => {
    fetchParties()
  }, [typeFilter])

  const filteredParties = parties.filter(party =>
    party.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const getIcon = (type: string) => {
    switch (type) {
      case 'customer': return <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
      case 'factory': return <Factory className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
      case 'supplier': return <Package className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />
      default: return <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />
    }
  }

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center gap-2 sm:gap-4 mb-6 min-w-0">
        <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
          <FileText className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 hidden sm:block" />
          <span className="truncate">Account Statements</span>
        </h2>
      </div>

      {/* Type Filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
        <div className="flex bg-white rounded-xl border p-1 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {['all', 'customer', 'factory', 'supplier'].map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1 text-center capitalize ${
                typeFilter === type
                  ? 'bg-black text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {type === 'all' ? 'All' : type + 's'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search party..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none text-sm sm:text-base"
        />
      </div>

      {/* Parties List */}
      <div className="grid gap-3 sm:gap-4">
        {filteredParties.map(party => {
          let displayDate = new Date(party.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          let displayNote = party.note || '';

          if (displayNote.includes('Due Started: ')) {
            const match = displayNote.match(/Due Started:\s*(\d{4}-\d{2}-\d{2})/);
            if (match && match[1]) {
              const [year, month, day] = match[1].split('-');
              displayDate = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
              displayNote = displayNote.replace(`Due Started: ${match[1]}\n`, '').replace(`Due Started: ${match[1]}`, '').trim();
            }
          }

          return (
            <Link
              key={party.id}
              href={`/statements/${party.id}`}
              className="relative group bg-white rounded-xl border p-3 sm:p-4 flex flex-row items-center justify-between gap-3 sm:gap-4 transition-all hover:border-gray-400 hover:shadow-md"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  {getIcon(party.party_type)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-base sm:text-lg truncate">{party.name}</h3>
                  <div className="flex items-center gap-1 mt-0.5 text-xs sm:text-sm text-gray-500">
                    <span className="capitalize">{party.party_type}</span>
                    <span className="hidden sm:inline"> • {displayDate}</span>
                    {displayNote && (
                      <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 ml-1 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 ml-2">
                <div className="text-right">
                  <p className="text-[10px] sm:text-sm text-gray-500">Balance</p>
                  <p className={`font-bold text-sm sm:text-base ${party.current_balance > 0 ? 'text-green-600' : party.current_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatBalance(party.current_balance)}
                  </p>
                </div>
                <FileText className="hidden sm:block w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>

            {/* Tooltip for Note */}
              {displayNote && (
              <div className="absolute bottom-full right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[calc(100vw-2rem)] md:max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {displayNote}
                {/* Tooltip downward arrow */}
                <div className="absolute top-full right-6 md:left-1/2 md:right-auto md:-translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
              </div>
            )}
          </Link>
          )
        })}
      </div>
    </div>
  )
}