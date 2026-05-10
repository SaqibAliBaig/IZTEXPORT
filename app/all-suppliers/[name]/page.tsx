'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

interface Statement {
  id: string
  name: string
  current_balance: number
  created_at: string
}

export default function SupplierStatements() {
  const params = useParams()
  const router = useRouter()
  
  // Get the supplier name dynamically from the URL route
  const supplierName = decodeURIComponent(params.name as string)
  
  const [statements, setStatements] = useState<Statement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    if (supplierName && supplierName !== 'undefined') {
      fetchStatements()
    }
  }, [supplierName])

  const fetchStatements = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('parties')
      .select('id, name, current_balance, created_at')
      .eq('party_type', 'supplier')
      .eq('name', supplierName)
      .order('created_at', { ascending: false })
    
    if (data) {
      setStatements(data)
    }
    setIsLoading(false)
  }

  const sortedStatements = [...statements].sort((a, b) => {
    if (sortOrder === 'desc') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{supplierName}'s Statements</h1>
        </div>

        {statements.length > 0 && (
          <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setSortOrder('desc')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sortOrder === 'desc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortOrder('asc')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sortOrder === 'asc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Oldest
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading statements...</p>
        </div>
      ) : statements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <p className="text-gray-500">No statements found for this supplier.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedStatements.map((stmt, index) => (
            <Link 
              href={`/statements/${stmt.id}`} 
              key={stmt.id}
              className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-all hover:border-orange-300 flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <h3 className="text-lg font-bold text-gray-900">Statement #{sortOrder === 'desc' ? statements.length - index : index + 1}</h3>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  Number(stmt.current_balance) > 0 ? 'bg-red-100 text-red-800' :
                  Number(stmt.current_balance) < 0 ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  ₹{Math.abs(Number(stmt.current_balance)).toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex-1">
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-500">Created:</span> {new Date(stmt.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-orange-600 font-medium text-center hover:underline">
                View Statement Details
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}