'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, FileText, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Statement {
  id: string
  name: string
  current_balance: number
  created_at: string
  note?: string
}

export default function FactoryStatements() {
  const params = useParams()
  const router = useRouter()
  
  // Get the factory name dynamically from the URL route
  const factoryName = decodeURIComponent(params.name as string)
  
  const [statements, setStatements] = useState<Statement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    if (factoryName && factoryName !== 'undefined') {
      fetchStatements()
    }
  }, [factoryName])

  const fetchStatements = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('parties')
      .select('id, name, current_balance, created_at, note')
      .eq('party_type', 'factory')
      .eq('name', factoryName)
      .order('created_at', { ascending: false })
    
    if (data) {
      setStatements(data)
    }
    setIsLoading(false)
  }

  const handleDeleteStatement = (partyId: string, e: React.MouseEvent) => {
    // Prevent the click from bubbling up to the Link surrounding the panel
    e.preventDefault();
    e.stopPropagation();

    const statementToDel = statements.find(s => s.id === partyId);
    if (statementToDel && statementToDel.current_balance !== 0) {
      toast.error('Cannot delete a statement with a non-zero closing balance.');
      return;
    }

    toast((t) => (
      <div>
        <p className="mb-2 font-semibold text-gray-800">Are you sure?</p>
        <p className="text-sm text-gray-600 mb-4">
          This will delete the statement and all associated production records, cloth issues, payments, and ledger entries. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              const deletionToast = toast.loading('Deleting statement...');
              try {
                // 1. Delete all payments related to this statement
                const { error: err1 } = await supabase.from('payments').delete().eq('party_id', partyId);
                if (err1) throw err1;
                // 2. Delete all ledger entries related to this statement
                const { error: err2 } = await supabase.from('ledger_entries').delete().eq('party_id', partyId);
                if (err2) throw err2;
                // 3. Delete all production records related to this factory statement
                const { error: err3 } = await supabase.from('production_records').delete().eq('factory_id', partyId);
                if (err3) throw err3;
                // 4. Delete all cloth issues related to this factory statement
                const { error: err4 } = await supabase.from('cloth_issues').delete().eq('factory_id', partyId);
                if (err4) {
                  if (err4.message?.includes('foreign key constraint')) {
                    throw new Error("Cannot delete this statement because its issued cloth is being used in production records of other statements. Please delete those newer statements first.");
                  }
                  throw err4;
                }
                // 5. Finally, delete the statement (party record) itself
                const { error } = await supabase.from('parties').delete().eq('id', partyId);
                
                if (error) throw error;
                
                toast.success('Statement deleted successfully', { id: deletionToast });
                setStatements(prev => prev.filter(s => s.id !== partyId));
              } catch (error: any) {
                toast.error('Failed to delete statement: ' + error.message, { id: deletionToast });
              }
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

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
          <h1 className="text-2xl font-bold text-gray-900">{factoryName}'s Statements</h1>
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
          <p className="text-gray-500">No statements found for this factory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedStatements.map((stmt, index) => (
            <Link 
              href={`/statements/${stmt.id}`} 
              key={stmt.id}
              className="relative group bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-all hover:border-purple-300 flex flex-col hover:z-[9999]"
            >
              <div
                role="button"
                onClick={(e) => handleDeleteStatement(stmt.id, e)}
                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Delete Statement Completely"
              >
                <X className="w-5 h-5" />
              </div>

              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 pr-8">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <h3 className="text-lg font-bold text-gray-900">Statement #{sortOrder === 'desc' ? statements.length - index : index + 1}</h3>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  Number(stmt.current_balance) < 0 ? 'bg-green-100 text-green-800' :
                  Number(stmt.current_balance) > 0 ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  ₹{Math.abs(Number(stmt.current_balance)).toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex-1">
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-500">Created:</span> {new Date(stmt.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {stmt.note && stmt.note.trim() && (
                  <div className="mt-2 flex items-start gap-1.5 text-sm text-gray-600 bg-gray-50 p-2 rounded-md border border-gray-100">
                    <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
                    <p className="truncate" title="Hover card to view full note">
                      {stmt.note.trim().split('\n')[0]}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-purple-600 font-medium text-center hover:underline">
                View Statement Details
              </div>

              {/* Tooltip for Note */}
              {stmt.note && stmt.note.trim() && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-max max-w-[calc(100vw-2rem)] md:max-w-xs p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-[9999] whitespace-pre-wrap cursor-default pointer-events-none">
                  <span className="font-semibold text-gray-300">Note:</span> {stmt.note.trim()}
                  {/* Tooltip upward arrow */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900"></div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}