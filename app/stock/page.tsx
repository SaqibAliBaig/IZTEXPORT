'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Package, ArrowUpDown, Shirt, ArrowLeft, X, AlertTriangle, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface ClothStock {
  id: string
  cloth_name: string
  cloth_color: string
  meters_purchased: number
  meters_issued: number
  meters_remaining: number
  note?: string
  purchase: {
    color_image_url: string
    purchase_date: string
    note?: string
  }
}

export default function StockPage() {
  const router = useRouter()
  const [stocks, setStocks] = useState<ClothStock[]>([])
  const [productStocks, setProductStocks] = useState<{product_type: string, produced: number, sold: number, quantity: number}[]>([])
  const [recentSales, setRecentSales] = useState<{id: string, product_type: string, quantity: number, customer_name: string, date: string, note?: string}[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'remaining'>('name')
  const [activeTab, setActiveTab] = useState<'cloth' | 'products'>('cloth')
  const [loading, setLoading] = useState(true)
  const [clearingStock, setClearingStock] = useState<ClothStock | null>(null)
  const [clearingProduct, setClearingProduct] = useState<{product_type: string, quantity: number} | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    fetchStock()
    fetchProductStock()
  }, [])

  const fetchStock = async () => {
    const { data, error } = await supabase
      .from('cloth_stock')
      .select(`
        *,
        purchase:cloth_purchases!cloth_stock_purchase_id_fkey(
          color_image_url,
          purchase_date,
          note
        )
      `)
      .gt('meters_remaining', 0) // Only show items with remaining stock
      .order('cloth_name')

    if (data) {
      setStocks(data)
    }
    setLoading(false)
  }

  const fetchProductStock = async () => {
    const { data: productions } = await supabase
      .from('production_records')
      .select('product_type, output_quantity')
      .gt('output_quantity', 0)

    const { data: sales } = await supabase
      .from('sales')
      .select('id, product_type, quantity, sale_date, customer_id, note')
      .gt('quantity', 0)
      .order('sale_date', { ascending: false })

    const { data: customers } = await supabase
      .from('parties')
      .select('id, name')
      .eq('party_type', 'customer')

    const productMap = new Map<string, { produced: number, sold: number }>()

    productions?.forEach(p => {
      const type = (p.product_type || 'Unknown').trim()
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.produced += Number(p.output_quantity)
      productMap.set(capitalizedType, existing)
    })

    sales?.forEach(s => {
      const type = (s.product_type || 'Unknown').trim()
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.sold += Number(s.quantity)
      productMap.set(capitalizedType, existing)
    })

    const pStocks = Array.from(productMap.entries()).map(([product_type, { produced, sold }]) => ({
      product_type,
      produced,
      sold,
      quantity: Math.max(0, produced - sold)
    })).sort((a, b) => b.quantity - a.quantity)

    setProductStocks(pStocks)

    const recent = sales?.slice(0, 5).map(s => {
      const customer = customers?.find(c => c.id === s.customer_id)
      return {
        id: s.id,
        product_type: s.product_type || 'Unknown',
        quantity: Number(s.quantity),
        customer_name: customer?.name || 'Unknown Customer',
        date: s.sale_date,
        note: s.note
      }
    })
    setRecentSales(recent || [])
  }

  const executeClearCloth = async () => {
    if (!clearingStock) return
    setIsClearing(true)
    try {
      const snapshotData = {
        snapshot_date: new Date().toISOString().split('T')[0],
        total_remaining: clearingStock.meters_remaining,
        details: [clearingStock]
      }
      const { error: snapError } = await supabase.from('stock_snapshots').insert(snapshotData)
      if (snapError) throw snapError

      const { error: delError } = await supabase.from('cloth_stock').delete().eq('id', clearingStock.id)
      if (delError) throw delError

      toast.success('Stock cleared and archived')
      setClearingStock(null)
      fetchStock()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to clear stock')
    } finally {
      setIsClearing(false)
    }
  }

  const executeClearProduct = async () => {
    if (!clearingProduct) return
    setIsClearing(true)
    try {
      const snapshotData = {
        snapshot_date: new Date().toISOString().split('T')[0],
        total_remaining: clearingProduct.quantity,
        details: [{
          cloth_name: clearingProduct.product_type,
          cloth_color: 'Finished Garment',
          meters_purchased: clearingProduct.quantity,
          meters_issued: clearingProduct.quantity,
          meters_remaining: clearingProduct.quantity
        }]
      }
      const { error: snapError } = await supabase.from('stock_snapshots').insert(snapshotData)
      if (snapError) throw snapError

      await supabase.from('production_records').update({ output_quantity: 0 }).eq('product_type', clearingProduct.product_type).gt('output_quantity', 0)
      await supabase.from('sales').update({ quantity: 0 }).eq('product_type', clearingProduct.product_type).gt('quantity', 0)

      toast.success('Garments cleared and archived')
      setClearingProduct(null)
      fetchProductStock()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to clear garments')
    } finally {
      setIsClearing(false)
    }
  }

  const filteredStocks = stocks.filter(stock =>
    stock.cloth_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.cloth_color?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (sortBy === 'name') {
      return a.cloth_name.localeCompare(b.cloth_name)
    }
    return b.meters_remaining - a.meters_remaining
  })

  const totalRemaining = stocks.reduce((sum, stock) => sum + stock.meters_remaining, 0)
  const totalPurchased = stocks.reduce((sum, stock) => sum + stock.meters_purchased, 0)
  const totalIssued = stocks.reduce((sum, stock) => sum + stock.meters_issued, 0)

  const filteredProductStocks = productStocks.filter(stock =>
    stock.product_type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-24"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 sm:gap-4 mb-6">
        <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl sm:text-2xl font-bold">Inventory</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('cloth')}
          className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-xl text-sm sm:text-base font-medium transition-colors ${activeTab === 'cloth' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Raw Cloth
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-xl text-sm sm:text-base font-medium transition-colors ${activeTab === 'products' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Finished Garments
        </button>
      </div>

      {/* Summary Cards */}
      {activeTab === 'cloth' ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Total Purchased</p>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 truncate">{totalPurchased.toFixed(2)}m</p>
          </div>
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Total Issued</p>
            <p className="text-sm sm:text-2xl font-bold text-blue-600 truncate">{totalIssued.toFixed(2)}m</p>
          </div>
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Available</p>
            <p className="text-sm sm:text-2xl font-bold text-green-600 truncate">{totalRemaining.toFixed(2)}m</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Total Produced</p>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 truncate">{productStocks.reduce((sum, p) => sum + p.produced, 0)}</p>
          </div>
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Total Sold</p>
            <p className="text-sm sm:text-2xl font-bold text-blue-600 truncate">{productStocks.reduce((sum, p) => sum + p.sold, 0)}</p>
          </div>
          <div className="bg-white rounded-xl p-2 sm:p-4 border text-center sm:text-left flex flex-col justify-center">
            <p className="text-[10px] sm:text-sm text-gray-500 leading-tight mb-1 sm:mb-0">Ready Stock</p>
            <p className="text-sm sm:text-2xl font-bold text-green-600 truncate">{productStocks.reduce((sum, p) => sum + p.quantity, 0)}</p>
          </div>
        </div>
      )}

      {/* Search and Sort */}
      <div className="flex gap-2 sm:gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 sm:top-3.5 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
          <input
            type="text"
            placeholder={activeTab === 'cloth' ? "Search cloth..." : "Search garments..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 border rounded-xl text-sm sm:text-base outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        {activeTab === 'cloth' && (
          <button
            onClick={() => setSortBy(sortBy === 'name' ? 'remaining' : 'name')}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 border rounded-xl hover:bg-gray-50 whitespace-nowrap text-sm sm:text-base"
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="hidden sm:inline">Sort by {sortBy === 'name' ? 'Quantity' : 'Name'}</span>
            <span className="sm:hidden">Sort</span>
          </button>
        )}
      </div>

      {/* Stock List */}
      <div className="space-y-4">
        {activeTab === 'cloth' ? (
          sortedStocks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No stock available</p>
            </div>
          ) : (
            sortedStocks.map(stock => (
              <div key={stock.id} className="relative group bg-white rounded-xl border p-3 sm:p-4 transition-all hover:border-gray-400 hover:shadow-md">
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Thumbnail */}
                  {stock.purchase?.color_image_url ? (
                    <img
                      src={stock.purchase.color_image_url}
                      alt={stock.cloth_color}
                      className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-2">
                        <h3 className="font-semibold text-base sm:text-lg truncate">{stock.cloth_name}</h3>
                        {stock.cloth_color && (
                          <p className="text-xs sm:text-sm text-gray-600 truncate">{stock.cloth_color}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center justify-end gap-1 sm:gap-2 mb-1">
                          <p className="text-lg sm:text-2xl font-bold text-green-600">
                            {stock.meters_remaining.toFixed(2)}m
                          </p>
                          <button onClick={() => setClearingStock(stock)} className="relative z-10 p-1 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Clear Stock">
                            <X className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <p className="text-[10px] sm:text-xs text-gray-500">available</p>
                          {(stock.note || stock.purchase?.note) && (
                            <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2 sm:mt-3">
                      <div className="flex justify-between text-[10px] sm:text-xs text-gray-500 mb-1">
                        <span>Issued: {stock.meters_issued}m</span>
                        <span>Total: {stock.meters_purchased}m</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                        <div
                          className="bg-blue-600 h-1.5 sm:h-2 rounded-full"
                          style={{ 
                            width: `${(stock.meters_issued / stock.meters_purchased * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tooltip for Note */}
                {(stock.note || stock.purchase?.note) && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                    <span className="font-semibold text-gray-300">Note:</span> {stock.note || stock.purchase?.note}
                    {/* Tooltip downward arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          filteredProductStocks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Shirt className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No finished products available</p>
            </div>
          ) : (
            filteredProductStocks.map(stock => (
              <div key={stock.product_type} className="bg-white rounded-xl border p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shirt className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500" />
                    </div>
                    <div className="min-w-0 pr-2">
                      <h3 className="font-semibold text-base sm:text-lg truncate">{stock.product_type}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        Produced: {stock.produced} • Sold: {stock.sold}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center justify-end gap-1 sm:gap-2 mb-1">
                      <p className="text-lg sm:text-2xl font-bold text-green-600">
                        {stock.quantity.toLocaleString('en-IN')}
                      </p>
                      <button onClick={() => setClearingProduct(stock)} className="p-1 sm:p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Clear Garment Stock">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-500">available</p>
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Recent Sales Section */}
      {activeTab === 'products' && (
        <div className="mt-8 sm:mt-10">
          <h3 className="text-lg sm:text-xl font-bold mb-4">Recent 5 Sales</h3>
          <div className="space-y-3">
            {recentSales.length > 0 ? (
              recentSales.map(sale => (
                <div key={sale.id} className="relative group bg-white rounded-xl border p-3 sm:p-4 flex justify-between items-center transition-all hover:border-gray-400 hover:shadow-md">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shirt className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
                    </div>
                    <div className="min-w-0 pr-2">
                      <h3 className="font-semibold text-base sm:text-lg truncate">{sale.product_type}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">To: {sale.customer_name}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg sm:text-xl font-bold text-red-600">
                      -{sale.quantity.toLocaleString('en-IN')}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-400">
                      <span>{new Date(sale.date).toLocaleDateString()}</span>
                      {sale.note && (
                        <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Tooltip for Note */}
                  {sale.note && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                      <span className="font-semibold text-gray-300">Note:</span> {sale.note}
                      {/* Tooltip downward arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                    </div>
                  )}

                </div>
              ))
            ) : (
              <p className="text-center py-6 text-gray-500 bg-gray-50 rounded-xl border">
                No recent sales found
              </p>
            )}
          </div>
        </div>
      )}

      {/* Clear Cloth Modal */}
      {clearingStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Clear Cloth Stock</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to remove <strong>{clearingStock.meters_remaining}m</strong> of <strong>{clearingStock.cloth_name}</strong>? A snapshot will be saved in your history.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClearingStock(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                onClick={executeClearCloth}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Product Modal */}
      {clearingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Clear Garment Stock</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to clear <strong>{clearingProduct.quantity.toLocaleString('en-IN')}</strong> units of <strong>{clearingProduct.product_type}</strong>? A snapshot will be saved in your history.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClearingProduct(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isClearing}
              >
                Cancel
              </button>
              <button
                onClick={executeClearProduct}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}