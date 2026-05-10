'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Customer {
  id: string
  name: string
  phone: string
  current_balance: number
  created_at: string
}

export default function AllCustomers() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('parties')
      .select('id, name, phone, current_balance, created_at')
      .eq('party_type', 'customer')
      .order('created_at', { ascending: true })
    
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const name = curr.name.toLowerCase().trim()
        if (!acc[name]) {
          acc[name] = curr
        } else {
          acc[name] = {
            ...curr,
            current_balance: Number(acc[name].current_balance) + Number(curr.current_balance),
            created_at: acc[name].created_at
          }
        }
        return acc
      }, {} as Record<string, Customer>)
      
      setCustomers(Object.values(grouped))
    }
    setIsLoading(false)
  }

  const filteredAndSortedCustomers = customers
    .filter(customer => customer.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Customers</h1>
            <p className="text-gray-500">Manage your customer statements and balances</p>
          </div>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border rounded-xl shadow-sm focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading customers...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No customers yet</h3>
          <p className="text-gray-500 mb-4">Start by adding a sale to create a customer statement.</p>
          <Link 
            href="/sales/add"
            className="inline-flex items-center justify-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            Record First Sale
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedCustomers.map(customer => (
            <Link 
              href={`/all-customers/${encodeURIComponent(customer.name)}`} 
              key={customer.id}
              className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-all hover:border-blue-300 flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{customer.name}</h3>
                    {customer.phone && <p className="text-sm text-gray-500">{customer.phone}</p>}
                  </div>
                </div>
              </div>
              
              <div className="flex-1">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500 mb-1">Total Balance</p>
                  <p className={`text-xl font-bold ${
                    Number(customer.current_balance) > 0 ? 'text-green-600' : 
                    Number(customer.current_balance) < 0 ? 'text-red-600' : 
                    'text-gray-900'
                  }`}>
                    ₹{Math.abs(Number(customer.current_balance)).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-blue-600 font-medium text-center hover:underline">
                View All Statements
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}