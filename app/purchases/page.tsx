'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Package, ArrowLeft, FileText, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Purchase {
  id: string
  cloth_name: string
  cloth_color: string
  color_image_url: string
  meters: number
  rate_per_meter: number
  total_amount: number
  purchase_date: string
  supplier_name: string
  note?: string
  created_at: string
}

export default function PurchasesPage() {
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name_asc' | 'name_desc'>('newest')
  const [loading, setLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const pressTimer = useRef<NodeJS.Timeout | null>(null)
  const hasJustLongPressed = useRef(false)

  useEffect(() => {
    fetchPurchases()
  }, [])

  const fetchPurchases = async () => {
    const { data: purchasesData } = await supabase
      .from('cloth_purchases')
      .select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: suppliersData } = await supabase
      .from('parties')
      .select('id, name')
      .eq('party_type', 'supplier')

    if (purchasesData) {
      const formattedPurchases = purchasesData.map(purchase => {
        const supplier = suppliersData?.find(s => s.id === purchase.supplier_id)
        return {
          ...purchase,
          supplier_name: supplier?.name || 'Unknown Supplier'
        }
      })
      setPurchases(formattedPurchases)
    }
    setLoading(false)
  }

  const handlePressStart = (id: string) => {
    hasJustLongPressed.current = false
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      hasJustLongPressed.current = true
      setIsSelectionMode(true)
      setSelectedIds(prev => prev.includes(id) ? prev : [...prev, id])
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50)
      }
    }, 500)
  }

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleClick = (e: React.MouseEvent, id: string) => {
    if (hasJustLongPressed.current) {
      e.preventDefault()
      hasJustLongPressed.current = false
      return
    }

    if (isSelectionMode) {
      e.preventDefault()
      toggleSelection(id)
    }
  }

  const handleDeleteClick = () => {
    toast((t) => (
      <div>
        <p className="mb-2 text-sm font-medium text-gray-800">
          Are you sure you want to delete {selectedIds.length} selected purchase{selectedIds.length > 1 ? 's' : ''}?
        </p>
        <p className="mb-4 text-xs text-gray-500">
          This will also remove the cloth from available stock. Supplier balances must be adjusted manually if needed.
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
              toast.dismiss(t.id)
              await performDeletion()
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    ), { duration: Infinity })
  }

  const performDeletion = async () => {
    setIsDeleting(true)
    try {
      // 1. Safe Check: Verify if any of these purchases have already been issued
      const { data: linkedIssues, error: issuesError } = await supabase
        .from('cloth_issues')
        .select('id')
        .in('cloth_purchase_id', selectedIds)
        .limit(1)

      if (issuesError) throw issuesError

      if (linkedIssues && linkedIssues.length > 0) {
        throw new Error('Cannot delete: Cloth from one or more selected purchases has already been issued to a factory.')
      }

      // 2. Remove associated raw stock
      await supabase
        .from('cloth_stock')
        .delete()
        .in('purchase_id', selectedIds)

      // 3. Delete the purchase record
      const { error } = await supabase
        .from('cloth_purchases')
        .delete()
        .in('id', selectedIds)
        
      if (error) {
        if (error.message.includes('cloth_issues_cloth_purchase_id_fkey')) {
          throw new Error('Cannot delete: Cloth has already been issued.')
        }
        throw error
      }
      
      toast.success(`Successfully deleted ${selectedIds.length} purchase${selectedIds.length > 1 ? 's' : ''}`)
      setSelectedIds([])
      setIsSelectionMode(false)
      fetchPurchases()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete purchase')
    } finally {
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    if (isSelectionMode && selectedIds.length === 0) {
      const timeout = setTimeout(() => setIsSelectionMode(false), 100);
      return () => clearTimeout(timeout);
    }
  }, [selectedIds, isSelectionMode])

  const filteredPurchases = purchases.filter(purchase => {
    const matchesSearch = purchase.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.cloth_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (purchase.cloth_color && purchase.cloth_color.toLowerCase().includes(searchTerm.toLowerCase()))

    let matchesDate = true
    if (dateFilter !== 'all') {
      const purchaseDate = new Date(purchase.purchase_date)
      const today = new Date()
      if (dateFilter === 'this_month') {
        matchesDate = purchaseDate.getMonth() === today.getMonth() && purchaseDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = purchaseDate.getMonth() === lastMonth.getMonth() && purchaseDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    return matchesSearch && matchesDate
  }).sort((a, b) => {
    if (sortOrder === 'newest') {
      const dateA = new Date(a.purchase_date).getTime()
      const dateB = new Date(b.purchase_date).getTime()
      if (dateA !== dateB) return dateB - dateA
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    } else if (sortOrder === 'oldest') {
      const dateA = new Date(a.purchase_date).getTime()
      const dateB = new Date(b.purchase_date).getTime()
      if (dateA !== dateB) return dateA - dateB
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    } else if (sortOrder === 'name_asc') {
      return a.supplier_name.localeCompare(b.supplier_name)
    } else if (sortOrder === 'name_desc') {
      return b.supplier_name.localeCompare(a.supplier_name)
    }
    return 0
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            Purchases History
          </h2>
        </div>
        <Link
          href="/purchases/add"
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Purchase
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by supplier, cloth name or color..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
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

          <div className="flex bg-white rounded-xl border p-1 overflow-x-auto">
            <button
              onClick={() => setSortOrder('newest')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'newest' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Newest First
            </button>
            <button
              onClick={() => setSortOrder('oldest')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'oldest' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Oldest First
            </button>
            <button
              onClick={() => setSortOrder('name_asc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'name_asc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Name (A-Z)
            </button>
            <button
              onClick={() => setSortOrder('name_desc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${sortOrder === 'name_desc' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Name (Z-A)
            </button>
          </div>
        </div>
      </div>

      {/* Purchases List */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-24 border"></div>
          ))}
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No purchase records found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPurchases.map(purchase => (
            <div 
              key={purchase.id} 
              className={`relative group rounded-xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-400 hover:shadow-md select-none ${isSelectionMode ? 'cursor-pointer' : ''} ${selectedIds.includes(purchase.id) ? 'bg-red-50 border-red-500' : 'bg-white'}`}
              onPointerDown={() => handlePressStart(purchase.id)}
              onPointerUp={handlePressEnd}
              onPointerCancel={handlePressEnd}
              onPointerLeave={handlePressEnd}
              onClick={(e) => handleClick(e, purchase.id)}
              onContextMenu={(e) => {
                if (typeof window !== 'undefined' && 'ontouchstart' in window) {
                  e.preventDefault()
                }
              }}
              style={{ WebkitTouchCallout: 'none' }}
            >
              <div className="flex items-center gap-4">
                {isSelectionMode && (
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(purchase.id)}
                      readOnly
                      className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 pointer-events-none"
                    />
                  </div>
                )}
                {purchase.color_image_url ? (
                  <img src={purchase.color_image_url} alt={purchase.cloth_color} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border" />
                ) : (
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-blue-500" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{purchase.supplier_name}</h3>
                  <p className="text-sm text-gray-600">
                    {purchase.meters.toLocaleString('en-IN')}m x {purchase.cloth_name} {purchase.cloth_color && `(${purchase.cloth_color})`} @ ₹{purchase.rate_per_meter.toLocaleString('en-IN')}/m
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-red-600">
                  ₹{purchase.total_amount.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center justify-end gap-1 mt-1 text-xs text-gray-500">
                  <span>{new Date(purchase.purchase_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  {purchase.note && (
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Tooltip for Note */}
              {purchase.note && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {purchase.note}
                  {/* Tooltip downward arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}

      {/* Selection Mode Bottom Bar */}
      {isSelectionMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white shadow-2xl border rounded-full px-6 py-3 flex items-center gap-4 z-[100]">
          <span className="font-medium text-sm text-gray-700 whitespace-nowrap">{selectedIds.length} selected</span>
          <div className="w-px h-6 bg-gray-200"></div>
          <button 
            onClick={handleDeleteClick}
            disabled={selectedIds.length === 0 || isDeleting}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button 
            onClick={() => {
              setSelectedIds([]);
              setIsSelectionMode(false);
            }}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title="Cancel selection"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}