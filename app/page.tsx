'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Package, Factory, Users, DollarSign, TrendingUp, Warehouse, FileText, Shirt, Edit2, X, Truck, Search, RotateCcw, Wallet, Store } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface DashboardStats {
  totalCloth: number
  totalIssued: number
  totalRemaining: number
  totalProducts: number
  customerDues: number
  factoryDues: number
  supplierDues: number
}

interface PartyDue {
  id: string
  name: string
  current_balance: number | string
}

interface PartyDetail {
  id: string
  name: string
  party_type: string
  current_balance: number
}

interface ProductDetail {
  product_type: string
  quantity: number
}

interface ClothDetail {
  id: string
  cloth_name: string
  cloth_color: string
  meters_remaining: number
}

interface RecentProduction {
  id: string
  product_type: string
  quantity: number
  factory_name: string
  date: string
}

interface RecentIssue {
  id: string
  factory_name: string
  cloth_name: string
  meters_given: number
  date: string
}

export default function Dashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    totalCloth: 0,
    totalIssued: 0,
    totalRemaining: 0,
    totalProducts: 0,
    customerDues: 0,
    factoryDues: 0,
    supplierDues: 0
  })

  const [editingPartyType, setEditingPartyType] = useState<'customer' | 'factory' | 'supplier' | null>(null)
  const [editingList, setEditingList] = useState<PartyDue[]>([])
  const [isLoadingEdit, setIsLoadingEdit] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [partyDetails, setPartyDetails] = useState<PartyDetail[]>([])
  const [productDetails, setProductDetails] = useState<ProductDetail[]>([])
  const [editSearchTerm, setEditSearchTerm] = useState('')
  const [clothDetails, setClothDetails] = useState<ClothDetail[]>([])
  const [recentProductions, setRecentProductions] = useState<RecentProduction[]>([])
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([])
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isResetIssuesModalOpen, setIsResetIssuesModalOpen] = useState(false)
  const [isResettingIssues, setIsResettingIssues] = useState(false)
  const [isResetGarmentsModalOpen, setIsResetGarmentsModalOpen] = useState(false)
  const [isResettingGarments, setIsResettingGarments] = useState(false)
  const [hoverEditingClothId, setHoverEditingClothId] = useState<string | null>(null)
  const [hoverEditingClothBalance, setHoverEditingClothBalance] = useState('')

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    const { data: clothData } = await supabase
      .from('cloth_stock')
      .select('id, cloth_name, cloth_color, meters_purchased, meters_issued, meters_remaining')
    
    const { data: duesData } = await supabase
      .from('parties')
      .select('id, name, party_type, current_balance, created_at')
      .order('created_at', { ascending: true })

    const { data: prodData } = await supabase
      .from('production_records')
      .select('id, product_type, output_quantity, factory_id, production_date')
      .gt('output_quantity', 0)
      .order('production_date', { ascending: false })
      .order('created_at', { ascending: false })

    const { data: salesData } = await supabase
      .from('sales')
      .select('product_type, quantity')
      .gt('quantity', 0)

    const { data: issuesData } = await supabase
      .from('cloth_issues')
      .select(`
        id, meters_given, issue_date,
        factory:parties!cloth_issues_factory_id_fkey(name),
        cloth_purchase:cloth_purchases!cloth_issues_cloth_purchase_id_fkey(cloth_name, cloth_color)
      `)
      .gt('meters_given', 0)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5)
      

    const productMap = new Map<string, { produced: number, sold: number }>()

    prodData?.forEach(p => {
      const type = (p.product_type || 'Unknown').trim()
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.produced += Number(p.output_quantity)
      productMap.set(capitalizedType, existing)
    })

    salesData?.forEach(s => {
      const type = (s.product_type || 'Unknown').trim()
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.sold += Number(s.quantity)
      productMap.set(capitalizedType, existing)
    })

    const pDetails = Array.from(productMap.entries()).map(([product_type, { produced, sold }]) => ({
      product_type,
      quantity: produced - sold
    })).filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity)

    const availableProducts = pDetails.reduce((sum, p) => sum + p.quantity, 0)

    setProductDetails(pDetails)

    const recentProds = (prodData || []).slice(0, 5).map(p => {
      const factory = duesData?.find(d => d.id === p.factory_id)
      return {
        id: p.id,
        product_type: p.product_type || 'Unknown',
        quantity: Number(p.output_quantity),
        factory_name: factory?.name || 'Unknown Factory',
        date: p.production_date
      }
    })
    setRecentProductions(recentProds)

    const formattedRecentIssues = (issuesData || []).map((issue: any) => ({
      id: issue.id,
      factory_name: issue.factory?.name || 'Unknown Factory',
      cloth_name: `${issue.cloth_purchase?.cloth_name || 'Unknown Cloth'} ${issue.cloth_purchase?.cloth_color ? `(${issue.cloth_purchase.cloth_color})` : ''}`.trim(),
      meters_given: Number(issue.meters_given),
      date: issue.issue_date
    }))
    setRecentIssues(formattedRecentIssues)

    if (clothData) {
      const cDetails = clothData
        .filter(c => Number(c.meters_remaining) > 0)
        .map(c => ({
          id: c.id,
          cloth_name: c.cloth_name,
          cloth_color: c.cloth_color,
          meters_remaining: Number(c.meters_remaining)
        }))
        .sort((a, b) => b.meters_remaining - a.meters_remaining)

      setClothDetails(cDetails)
      setStats(prev => ({
        ...prev,
        totalCloth: clothData.reduce((sum, item) => sum + Number(item.meters_purchased), 0),
        totalIssued: clothData.reduce((sum, item) => sum + Number(item.meters_issued), 0),
        totalRemaining: clothData.reduce((sum, item) => sum + Number(item.meters_remaining), 0),
        totalProducts: availableProducts
      }))
    }

    if (duesData) {
      const groupedDues = Object.values(duesData.reduce((acc: any, curr: any) => {
        const key = `${curr.name.toLowerCase().trim()}-${curr.party_type}`
        if (!acc[key]) {
          acc[key] = curr
        } else {
          acc[key] = {
            ...curr,
            current_balance: Number(acc[key].current_balance) + Number(curr.current_balance)
          }
        }
        return acc
      }, {})).sort((a: any, b: any) => a.name.localeCompare(b.name)) as PartyDetail[]

      setPartyDetails(groupedDues)
      setStats(prev => ({
        ...prev,
        customerDues: groupedDues
          .filter(d => d.party_type === 'customer')
          .reduce((sum, d) => sum + Number(d.current_balance), 0),
        factoryDues: groupedDues
          .filter(d => d.party_type === 'factory')
          .reduce((sum, d) => sum + Number(d.current_balance), 0),
        supplierDues: groupedDues
          .filter(d => d.party_type === 'supplier')
          .reduce((sum, d) => sum + Number(d.current_balance), 0)
      }))
    }
  }

  const handleOpenEditModal = async (type: 'customer' | 'factory' | 'supplier') => {
    setEditingPartyType(type)
    setEditSearchTerm('')
    setIsLoadingEdit(true)
    const { data, error } = await supabase
      .from('parties')
      .select('id, name, current_balance, created_at')
      .eq('party_type', type)
      .order('created_at', { ascending: true })
    
    if (data) {
      const grouped = Object.values(data.reduce((acc: any, curr: any) => {
        const key = curr.name.toLowerCase().trim()
        if (!acc[key]) acc[key] = curr
        else {
          acc[key] = {
            ...curr,
            current_balance: Number(acc[key].current_balance) + Number(curr.current_balance)
          }
        }
        return acc
      }, {})).sort((a: any, b: any) => a.name.localeCompare(b.name)) as PartyDue[]
      setEditingList(grouped)
    }
    if (error) toast.error(`Failed to load ${type}s`)
    setIsLoadingEdit(false)
  }

  const handleDueChange = (id: string, value: string) => {
    setEditingList(prev => 
      prev.map(c => c.id === id ? { ...c, current_balance: value === '' ? '' : Number(value) } : c)
    )
  }

  const resetClothStock = async () => {
    setIsResetting(true)
    try {
      const { data: activeStock } = await supabase
        .from('cloth_stock')
        .select('*')

      if (!activeStock || activeStock.length === 0) {
        toast.error('No cloth to reset')
        setIsResetModalOpen(false)
        setIsResetting(false)
        return
      }

      const snapshotData = {
        snapshot_date: new Date().toISOString().split('T')[0],
        total_remaining: stats.totalRemaining,
        details: activeStock
      }

      const { error: snapshotError } = await supabase
        .from('stock_snapshots')
        .insert(snapshotData)

      if (snapshotError) {
        console.error('Snapshot Error:', snapshotError)
        toast.error(`Database error: ${snapshotError.message}`)
        setIsResetting(false)
        return
      }

      // Completely clear cloth stock to reset all metrics to 0
      const idsToDelete = activeStock.map(stock => stock.id)
      const { error: deleteError } = await supabase
        .from('cloth_stock')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        toast.error(`Database error: ${deleteError.message}`)
        setIsResetting(false)
        return
      }

      toast.success('Cloth stock reset successfully')
      setIsResetModalOpen(false)
      fetchStats()
    } catch (e) {
      toast.error('Failed to reset stock')
    } finally {
      setIsResetting(false)
    }
  }

  const resetIssuedCloth = async () => {
    setIsResettingIssues(true)
    try {

      // Reset the counters in cloth_stock and restore remaining inventory
      const { data: activeStock } = await supabase
        .from('cloth_stock')
        .select('*')
        .gt('meters_issued', 0)

      if (activeStock && activeStock.length > 0) {
        const updates = activeStock.map(stock =>
          supabase
            .from('cloth_stock')
            .update({ 
              meters_issued: 0,
              meters_remaining: Number(stock.meters_remaining) + Number(stock.meters_issued)
            })
            .eq('id', stock.id)
        )
        await Promise.all(updates)
      }

      toast.success('Factory issued cloth reset successfully')
      setIsResetIssuesModalOpen(false)
      fetchStats()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to reset issued cloth')
    } finally {
      setIsResettingIssues(false)
    }
  }

  const resetGarmentsStock = async () => {
    setIsResettingGarments(true)
    try {
      if (productDetails.length === 0) {
        toast.error('No ready garments to reset')
        setIsResetGarmentsModalOpen(false)
        setIsResettingGarments(false)
        return
      }

      const snapshotData = {
        snapshot_date: new Date().toISOString().split('T')[0],
        total_remaining: stats.totalProducts,
        details: productDetails.map(p => ({
          cloth_name: p.product_type,
          cloth_color: 'Finished Garment',
          meters_purchased: p.quantity,
          meters_issued: p.quantity,
          meters_remaining: p.quantity
        }))
      }

      const { error: snapshotError } = await supabase.from('stock_snapshots').insert(snapshotData)
      if (snapshotError) throw snapshotError

      // Zero out production quantities to reset total and hide from recent
      await supabase.from('production_records').update({ output_quantity: 0 }).gt('output_quantity', 0)

      // Zero out sales quantities to balance the equation
      await supabase.from('sales').update({ quantity: 0 }).gt('quantity', 0)

      toast.success('Ready garments reset successfully')
      setIsResetGarmentsModalOpen(false)
      fetchStats()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to reset garments')
    } finally {
      setIsResettingGarments(false)
    }
  }

   const saveDues = async () => {
    setIsSaving(true)
    try {
      // Remove the accidentally pasted text right here
      const updates = editingList.map(async c => {
        const { data: stmts } = await supabase
          .from('parties')
          .select('id')
          .eq('name', c.name)
          .eq('party_type', editingPartyType)
          .order('created_at', { ascending: false })
          
        if (stmts && stmts.length > 0) {
          const newestId = stmts[0].id
          await supabase.from('parties').update({ current_balance: Number(c.current_balance) || 0 }).eq('id', newestId)
          if (stmts.length > 1) {
            const olderIds = stmts.slice(1).map(s => s.id)
            await supabase.from('parties').update({ current_balance: 0 }).in('id', olderIds)
          }
        }
      })
      await Promise.all(updates)
      toast.success(`${editingPartyType} dues updated successfully`)
      setEditingPartyType(null)
      fetchStats()
    } catch (e) {
      toast.error('Failed to update dues')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClothHoverEditClick = (e: React.MouseEvent, cloth: ClothDetail) => {
    e.stopPropagation()
    setHoverEditingClothId(cloth.id)
    setHoverEditingClothBalance(String(cloth.meters_remaining))
  }

  const saveClothHoverEdit = async (clothId: string, valueToSave: string) => {
    const newBalance = Number(valueToSave) || 0
    const cloth = clothDetails.find(c => c.id === clothId)
    
    if (cloth && cloth.meters_remaining !== newBalance) {
      const { error } = await supabase.from('cloth_stock').update({ meters_remaining: newBalance }).eq('id', clothId)
      if (!error) {
        toast.success('Stock updated')
        fetchStats()
      }
    }
    setHoverEditingClothId(null)
  }

  const filteredEditingList = editingList.filter(party => 
    party.name.toLowerCase().includes(editSearchTerm.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-4 border cursor-pointer transition-all hover:border-gray-400 hover:shadow-md" onClick={() => router.push('/stock')}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Total Cloth</p>
                <button onClick={(e) => { e.stopPropagation(); setIsResetModalOpen(true); }} className="text-gray-400 hover:text-blue-600 transition-colors" title="Reset Total Cloth">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCloth.toLocaleString('en-IN')} mtrs</p>
            </div>
            <Package className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Issued to Factory</p>
                <button onClick={() => setIsResetIssuesModalOpen(true)} className="text-gray-400 hover:text-green-600 transition-colors" title="Reset Issued Cloth">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalIssued.toLocaleString('en-IN')} mtrs</p>
            </div>
            <Factory className="w-8 h-8 text-green-500" />
          </div>

          {/* Recent Issues Hover Details */}
        <div className="absolute top-full right-0 md:left-0 md:right-auto mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block max-h-[28rem] overflow-y-auto p-3 cursor-default" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Recent 5 Issues</h4>
            <div className="space-y-2">
              {recentIssues.length > 0 ? (
                recentIssues.map(ri => (
                  <div key={ri.id} className="bg-gray-50 p-2 rounded-lg border flex justify-between items-center">
                    <div className="overflow-hidden pr-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{ri.cloth_name}</p>
                      <p className="text-xs text-gray-500 truncate">To: {ri.factory_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-600">{ri.meters_given.toLocaleString('en-IN')} mtrs</p>
                      <p className="text-[10px] text-gray-400">{new Date(ri.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No recent issues</p>
              )}
            </div>
          <Link href="/issues" className="block text-center text-xs text-green-600 hover:underline mt-3 pt-2 border-t font-medium">
            View complete issues history
          </Link>
          </div>
        </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md" onClick={() => router.push('/stock')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Cloth Remaining</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRemaining.toLocaleString('en-IN')} mtrs</p>
            </div>
            <Warehouse className="w-8 h-8 text-teal-500" />
          </div>

          {/* Cloth Remaining Hover Details */}
      <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-72 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block focus-within:block max-h-64 overflow-y-auto p-3 cursor-default" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2 border-b pb-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase">Cloth Stock Details</h4>
              <Link href="/snapshots" className="text-[10px] bg-teal-50 text-teal-600 px-2 py-1 rounded hover:bg-teal-100 font-medium">History</Link>
            </div>
            <div className="space-y-1 pt-1">
              {clothDetails.length > 0 ? (
                clothDetails.map(c => (
                  <div key={c.id} className="flex justify-between items-center py-1 border-b last:border-0">
                    <span className="text-sm text-gray-700 truncate pr-2">
                      {c.cloth_name} {c.cloth_color ? <span className="text-gray-500">({c.cloth_color})</span> : ''}
                    </span>
                    {hoverEditingClothId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          autoFocus
                          value={hoverEditingClothBalance}
                          onChange={(e) => setHoverEditingClothBalance(e.target.value)}
                          onBlur={() => saveClothHoverEdit(c.id, hoverEditingClothBalance)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          className="w-20 px-1 py-0.5 border rounded text-right text-sm outline-none focus:ring-2 focus:ring-black text-gray-900"
                        />
                        <span className="text-sm text-gray-500">m</span>
                      </div>
                    ) : (
                      <span 
                        onClick={(e) => handleClothHoverEditClick(e, c)}
                        className="text-sm font-medium whitespace-nowrap text-gray-900 cursor-pointer hover:underline"
                        title="Click to edit"
                      >{c.meters_remaining.toLocaleString('en-IN')} mtrs</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No cloth available</p>
              )}
            </div>
          </div>
        </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md" onClick={() => router.push('/production')}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Ready Garments</p>
              <button onClick={(e) => { e.stopPropagation(); setIsResetGarmentsModalOpen(true); }} className="text-gray-400 hover:text-indigo-600 transition-colors" title="Reset Ready Garments">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalProducts.toLocaleString('en-IN')}</p>
            </div>
            <Shirt className="w-8 h-8 text-indigo-500" />
          </div>

          {/* Ready Garments Hover Details */}
      <div className="absolute top-full right-0 md:left-0 md:right-auto mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block max-h-[28rem] overflow-y-auto p-3 cursor-default" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Available Stock</h4>
            <div className="space-y-1 mb-4">
              {productDetails.length > 0 ? (
                productDetails.map(p => (
                  <div key={p.product_type} className="flex justify-between items-center py-1 border-b last:border-0">
                    <span className="text-sm text-gray-700 truncate pr-2">{p.product_type}</span>
                    <span className={`text-sm font-medium whitespace-nowrap ${p.quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}>{p.quantity.toLocaleString('en-IN')}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No ready garments</p>
              )}
            </div>

            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 border-t pt-2">Recent 5 Productions</h4>
            <div className="space-y-2">
              {recentProductions.length > 0 ? (
                recentProductions.map(rp => (
                  <div key={rp.id} className="bg-gray-50 p-2 rounded-lg border flex justify-between items-center">
                    <div className="overflow-hidden pr-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{rp.product_type}</p>
                      <p className="text-xs text-gray-500 truncate">From: {rp.factory_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-600">+{rp.quantity.toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-gray-400">{new Date(rp.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No recent production</p>
              )}
            </div>
        <Link href="/production" className="block text-center text-xs text-indigo-600 hover:underline mt-3 pt-2 border-t font-medium">
          View complete production history
        </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Customer Dues</p>
            <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal('customer'); }} className="text-gray-400 hover:text-black transition-colors" title="Edit Customer Dues">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className={`text-2xl font-bold ${stats.customerDues > 0 ? 'text-green-500' : stats.customerDues < 0 ? 'text-red-500' : 'text-gray-900'}`}>₹{Math.abs(stats.customerDues).toLocaleString('en-IN')}</p>
            </div>
            <Users className="w-8 h-8 text-orange-500" />
          </div>
          
          {/* Customer Dues Hover Details */}
          <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-64 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block focus-within:block max-h-64 overflow-y-auto p-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Customer Details</h4>
            <div className="space-y-1">
              {partyDetails.filter(p => p.party_type === 'customer' && Number(p.current_balance) !== 0).length > 0 ? (
                <>
                {partyDetails.filter(p => p.party_type === 'customer' && Number(p.current_balance) !== 0).slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b last:border-0">
                    <Link href={`/all-customers/${encodeURIComponent(p.name)}`} className="text-sm text-gray-700 truncate pr-2 hover:text-blue-600 hover:underline cursor-pointer" title="View Statements">{p.name}</Link>
                    <Link 
                      href={`/all-customers/${encodeURIComponent(p.name)}`}
                      className={`text-sm font-medium whitespace-nowrap hover:underline ${Number(p.current_balance) > 0 ? 'text-green-500' : 'text-red-500'}`}
                      title="View statement to update balance"
                    >
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </Link>
                  </div>
                ))}
                {partyDetails.filter(p => p.party_type === 'customer' && Number(p.current_balance) !== 0).length > 5 && (
                  <Link href="/statements" className="block text-center text-xs text-blue-600 hover:underline mt-2 pt-2 border-t">
                    View all {partyDetails.filter(p => p.party_type === 'customer' && Number(p.current_balance) !== 0).length} customers
                  </Link>
                )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No outstanding dues</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Factory Dues</p>
            <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal('factory'); }} className="text-gray-400 hover:text-black transition-colors" title="Edit Factory Dues">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className={`text-2xl font-bold ${stats.factoryDues > 0 ? 'text-red-500' : stats.factoryDues < 0 ? 'text-green-500' : 'text-gray-900'}`}>₹{Math.abs(stats.factoryDues).toLocaleString('en-IN')}</p>
            </div>
            <DollarSign className="w-8 h-8 text-purple-500" />
          </div>

          {/* Factory Dues Hover Details */}
          <div className="absolute top-full right-0 mt-2 w-[calc(100vw-2rem)] sm:w-64 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block focus-within:block max-h-64 overflow-y-auto p-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Factory Details</h4>
            <div className="space-y-1">
              {partyDetails.filter(p => p.party_type === 'factory' && Number(p.current_balance) !== 0).length > 0 ? (
                <>
                {partyDetails.filter(p => p.party_type === 'factory' && Number(p.current_balance) !== 0).slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b last:border-0">
                    <Link href={`/all-factories/${encodeURIComponent(p.name)}`} className="text-sm text-gray-700 truncate pr-2 hover:text-blue-600 hover:underline cursor-pointer" title="View Statements">{p.name}</Link>
                    <Link 
                      href={`/all-factories/${encodeURIComponent(p.name)}`}
                      className={`text-sm font-medium whitespace-nowrap hover:underline ${Number(p.current_balance) > 0 ? 'text-red-500' : 'text-green-500'}`}
                      title="View statement to update balance"
                    >
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </Link>
                  </div>
                ))}
                {partyDetails.filter(p => p.party_type === 'factory' && Number(p.current_balance) !== 0).length > 5 && (
                  <Link href="/all-factories" className="block text-center text-xs text-blue-600 hover:underline mt-2 pt-2 border-t">
                    View all {partyDetails.filter(p => p.party_type === 'factory' && Number(p.current_balance) !== 0).length} factories
                  </Link>
                )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No outstanding dues</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border relative group hover:z-10 cursor-pointer transition-all hover:border-gray-400 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Supplier Dues</p>
            <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal('supplier'); }} className="text-gray-400 hover:text-black transition-colors" title="Edit Supplier Dues">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className={`text-2xl font-bold ${stats.supplierDues > 0 ? 'text-red-500' : stats.supplierDues < 0 ? 'text-green-500' : 'text-gray-900'}`}>₹{Math.abs(stats.supplierDues).toLocaleString('en-IN')}</p>
            </div>
            <Truck className="w-8 h-8 text-pink-500" />
          </div>

          {/* Supplier Dues Hover Details */}
          <div className="absolute top-full left-0 md:right-0 md:left-auto mt-2 w-[calc(100vw-2rem)] sm:w-64 bg-white border rounded-xl shadow-xl z-50 hidden group-hover:block focus-within:block max-h-64 overflow-y-auto p-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Supplier Details</h4>
            <div className="space-y-1">
              {partyDetails.filter(p => p.party_type === 'supplier' && Number(p.current_balance) !== 0).length > 0 ? (
                <>
                {partyDetails.filter(p => p.party_type === 'supplier' && Number(p.current_balance) !== 0).slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1 border-b last:border-0">
                    <Link href={`/all-suppliers/${encodeURIComponent(p.name)}`} className="text-sm text-gray-700 truncate pr-2 hover:text-blue-600 hover:underline cursor-pointer" title="View Statements">{p.name}</Link>
                    <Link 
                      href={`/all-suppliers/${encodeURIComponent(p.name)}`}
                      className={`text-sm font-medium whitespace-nowrap hover:underline ${Number(p.current_balance) > 0 ? 'text-red-500' : 'text-green-500'}`}
                      title="View statement to update balance"
                    >
                      ₹{Math.abs(Number(p.current_balance)).toLocaleString('en-IN')}
                    </Link>
                  </div>
                ))}
                {partyDetails.filter(p => p.party_type === 'supplier' && Number(p.current_balance) !== 0).length > 5 && (
                  <Link href="/all-suppliers" className="block text-center text-xs text-blue-600 hover:underline mt-2 pt-2 border-t">
                    View all {partyDetails.filter(p => p.party_type === 'supplier' && Number(p.current_balance) !== 0).length} suppliers
                  </Link>
                )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No outstanding dues</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <Link 
            href="/purchases/add"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Package className="w-6 h-6 mx-auto mb-2 text-blue-500" />
            <span className="text-sm">Add Purchase</span>
          </Link>
          
          <Link 
            href="/issues/add"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Factory className="w-6 h-6 mx-auto mb-2 text-green-500" />
            <span className="text-sm">Issue to Factory</span>
          </Link>

          <Link 
            href="/production/add"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Shirt className="w-6 h-6 mx-auto mb-2 text-indigo-500" />
            <span className="text-sm">Add Garments</span>
          </Link>

          <Link 
            href="/direct-garments/add"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Store className="w-6 h-6 mx-auto mb-2 text-rose-500" />
            <span className="text-sm">Direct Garment</span>
          </Link>

          <Link 
            href="/sales/add"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-orange-500" />
            <span className="text-sm">Add Sale</span>
          </Link>

          <Link 
            href="/payments"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Wallet className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
            <span className="text-sm">View Payments</span>
          </Link>

          <Link 
            href="/all-customers"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Users className="w-6 h-6 mx-auto mb-2 text-sky-500" />
            <span className="text-sm">All Customers</span>
          </Link>

          <Link 
            href="/all-factories"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Factory className="w-6 h-6 mx-auto mb-2 text-purple-500" />
            <span className="text-sm">All Factories</span>
          </Link>

          <Link 
            href="/all-suppliers"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <Truck className="w-6 h-6 mx-auto mb-2 text-pink-500" />
            <span className="text-sm">All Suppliers</span>
          </Link>

          <Link 
            href="/add-balance"
            className="bg-white p-4 rounded-xl border text-center transition-all hover:border-gray-400 hover:shadow-md"
          >
            <DollarSign className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            <span className="text-sm">Add Balance</span>
          </Link>
        </div>
      </div>

      {/* Edit Dues Modal */}
      {editingPartyType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold capitalize">Edit {editingPartyType} Dues</h3>
              <button onClick={() => setEditingPartyType(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={`Search ${editingPartyType}s...`}
                value={editSearchTerm}
                onChange={(e) => setEditSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-black outline-none"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {isLoadingEdit ? (
                <p className="text-center text-gray-500 py-4 capitalize">Loading {editingPartyType}s...</p>
              ) : editingList.length === 0 ? (
                <p className="text-center text-gray-500 py-4 capitalize">No {editingPartyType}s found.</p>
              ) : filteredEditingList.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No matching {editingPartyType} found.</p>
              ) : (
                filteredEditingList.map(party => (
                  <div key={party.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                    <span className="font-medium">{party.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${Number(party.current_balance) > 0 ? (editingPartyType === 'customer' ? 'text-green-500' : 'text-red-500') : Number(party.current_balance) < 0 ? (editingPartyType === 'customer' ? 'text-red-500' : 'text-green-500') : 'text-gray-500'}`}>₹</span>
                      <input 
                        type="number" 
                        step="0.01"
                        value={party.current_balance}
                        onChange={(e) => handleDueChange(party.id, e.target.value)}
                        className={`w-32 px-3 py-2 border rounded-lg text-right focus:ring-2 focus:ring-black outline-none font-semibold ${Number(party.current_balance) > 0 ? (editingPartyType === 'customer' ? 'text-green-600' : 'text-red-600') : Number(party.current_balance) < 0 ? (editingPartyType === 'customer' ? 'text-red-600' : 'text-green-600') : 'text-gray-900'}`}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-4 border-t flex justify-end gap-3">
              <button 
                onClick={() => setEditingPartyType(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={saveDues}
                disabled={isSaving || isLoadingEdit}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Stock Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center">
            <RotateCcw className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-1">Reset All Cloth Stock</h3>
            <Link href="/snapshots" className="text-sm text-blue-600 hover:underline mb-4 inline-block font-medium">
              View past reset history
            </Link>
            <p className="text-gray-600 mb-6">
              This will save a snapshot of your inventory and completely clear the <strong>Total Cloth</strong> and <strong>Issued</strong> metrics back to 0 mtrs.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isResetting}
              >
                Cancel
              </button>
              <button
                onClick={resetClothStock}
                disabled={isResetting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isResetting ? 'Saving...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Issued Cloth Modal */}
      {isResetIssuesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center">
            <RotateCcw className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-1">Reset Issued to Factory</h3>
            <p className="text-gray-600 mb-6">
              This will return all <strong>{stats.totalIssued.toLocaleString('en-IN')} mtrs</strong> of currently issued cloth back to your <strong>Cloth Remaining</strong> inventory. Your historical issue records will be preserved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsResetIssuesModalOpen(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isResettingIssues}
              >
                Cancel
              </button>
              <button
                onClick={resetIssuedCloth}
                disabled={isResettingIssues}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {isResettingIssues ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Garments Modal */}
      {isResetGarmentsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center">
            <RotateCcw className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-1">Reset Ready Garments</h3>
            <Link href="/snapshots" className="text-sm text-indigo-600 hover:underline mb-4 inline-block font-medium">
              View past reset history
            </Link>
            <p className="text-gray-600 mb-6">
              This will save a snapshot of your <strong>{stats.totalProducts.toLocaleString('en-IN')}</strong> ready garments and completely clear your active garment inventory back to 0.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsResetGarmentsModalOpen(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isResettingGarments}
              >
                Cancel
              </button>
              <button
                onClick={resetGarmentsStock}
                disabled={isResettingGarments}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isResettingGarments ? 'Saving...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}