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
      .order('created_at', { ascending: false })

    if (typeFilter !== 'all') {
      query = query.eq('party_type', typeFilter)
    }

    const { data } = await query
    if (data) setParties(data)
  }

  useEffect(() => {
    fetchParties()
  }, [typeFilter])

  const filteredParties = parties.filter(party =>
    party.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const getIcon = (type: string) => {
    switch (type) {
      case 'customer': return <Users className="w-5 h-5" />
      case 'factory': return <Factory className="w-5 h-5" />
      case 'supplier': return <Package className="w-5 h-5" />
      default: return <FileText className="w-5 h-5" />
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Account Statements</h2>
      </div>

      {/* Type Filter */}
      <div className="flex gap-2 mb-4">
        {['all', 'customer', 'factory', 'supplier'].map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-4 py-2 rounded-lg text-sm capitalize ${
              typeFilter === type
                ? 'bg-black text-white'
                : 'bg-white border text-gray-600'
            }`}
          >
            {type === 'all' ? 'All' : type + 's'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search party..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border rounded-xl"
        />
      </div>

      {/* Parties List */}
      <div className="space-y-3">
        {filteredParties.map(party => (
          <Link
            key={party.id}
            href={`/statements/${party.id}`}
            className="bg-white rounded-xl border p-4 flex items-center justify-between transition-all hover:border-gray-400 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                {getIcon(party.party_type)}
              </div>
              <div>
                <h3 className="font-semibold">{party.name}</h3>
                <p className="text-sm text-gray-500 capitalize">{party.party_type}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Balance</p>
                <p className={`font-bold ${party.current_balance > 0 ? 'text-green-600' : party.current_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  ₹{party.current_balance.toLocaleString('en-IN')}
                </p>
              </div>
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}