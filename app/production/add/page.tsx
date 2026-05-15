'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Factory, Package, Calendar, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface Factory {
  id: string
  name: string
  current_balance: number
}

interface ClothIssue {
  id: string
  factory_id: string
  meters_given: number
  product_type: string
  issue_date: string
  factory: { name: string }
  cloth_purchase: {
    cloth_name: string
    cloth_color: string
    color_image_url: string
  }
  production_records?: { id: string }[]
  is_active?: boolean
}
interface ClothStock {
  id: string
  purchase_id: string
  cloth_name: string
  cloth_color: string
  meters_remaining: number
  meters_issued: number
  purchase: { color_image_url: string }
}

export default function AddProductionPage() {
  const router = useRouter()
  const [factories, setFactories] = useState<Factory[]>([])
  const [issues, setIssues] = useState<ClothIssue[]>([])
  const [selectedFactory, setSelectedFactory] = useState('')
  const [selectedIssue, setSelectedIssue] = useState<ClothIssue | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clothStocks, setClothStocks] = useState<ClothStock[]>([])
  const [selectedStock, setSelectedStock] = useState<ClothStock | null>(null)
  const [metersToIssue, setMetersToIssue] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [formData, setFormData] = useState({
    factory_name: '',
    cloth_issue_id: '',
    product_type: '',
    output_quantity: '',
    output_unit: 'pieces',
    rate_per_unit: '',
    paid_amount: '',
    payment_mode: 'cash',
    production_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchFactories()
    fetchAvailableStock()
  }, [])

  const fetchFactories = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance')
      .eq('party_type', 'factory')
      .order('name')
    
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const name = curr.name.toLowerCase().trim()
        if (!acc[name]) acc[name] = { ...curr }
        else acc[name].current_balance += Number(curr.current_balance)
        return acc
      }, {} as Record<string, Factory>)
      
      setFactories(Object.values(grouped))
      
      // Auto-select if URL params exist (e.g. coming from Factory Records page)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const fId = params.get('factoryId')
        const iId = params.get('issueId')
        
        if (fId) {
          const factory = data.find(f => f.id === fId)
          if (factory) {
            const groupedFactory = Object.values(grouped).find((f: any) => f.name === factory.name)
            if (groupedFactory) {
              setOpeningBalance((groupedFactory as Factory).current_balance.toString())
            }
            setSearchQuery(factory.name)
            fetchFactoryIssues(factory.name, iId)
          }
        }
      }
    }
  }

  const fetchAvailableStock = async () => {
    const { data: stockData } = await supabase
      .from('cloth_stock')
      .select(`
        *,
        purchase:cloth_purchases!cloth_stock_purchase_id_fkey(color_image_url)
      `)
      .gt('meters_remaining', 0)
      .order('cloth_name')
      
    if (stockData) setClothStocks(stockData)
  }

  const fetchFactoryIssues = async (factoryName: string, preselectIssueId?: string | null) => {
    setSelectedFactory(factoryName)
    setFormData(prev => ({ ...prev, factory_name: factoryName, cloth_issue_id: '' }))
    setSelectedIssue(null)
    setSelectedStock(null)
    setMetersToIssue('')

    const { data: matchingParties } = await supabase
      .from('parties')
      .select('id')
      .eq('name', factoryName)
      .eq('party_type', 'factory')

    const partyIds = matchingParties?.map(p => p.id) || []
    let availableIssues: ClothIssue[] = []

    if (partyIds.length > 0) {
    const { data } = await supabase
      .from('cloth_issues')
      .select(`
        *,
        factory:parties!cloth_issues_factory_id_fkey(name),
        cloth_purchase:cloth_purchases!cloth_issues_cloth_purchase_id_fkey(
          cloth_name,
          cloth_color,
          color_image_url
        ),
        production_records(id)
      `)
      .in('factory_id', partyIds)
      .gt('meters_given', 0)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) {
      // Filter out soft-deleted issues
      availableIssues = (data as ClothIssue[]).filter(i => i.is_active !== false)
      setIssues(availableIssues)
    } else {
      setIssues([])
    }
    } else {
      setIssues([])
    }

    if (preselectIssueId) {
      const issue = availableIssues.find(i => i.id === preselectIssueId)
      if (issue) {
        handleIssueSelect(issue.id, null)
      }
    } else if (availableIssues.length > 0) {
      handleIssueSelect(availableIssues[0].id, null)
    } else if (clothStocks.length > 0) {
      handleIssueSelect(null, clothStocks[0].id)
    }
  }

  const handleIssueSelect = (issueId: string | null, stockId: string | null = null) => {
    const issue = issues.find(i => i.id === issueId)
    const stock = clothStocks.find(s => s.id === stockId)
    setSelectedIssue(issue || null)
    setSelectedStock(stock || null)
    setMetersToIssue('')
    setFormData(prev => ({
      ...prev,
      cloth_issue_id: issue ? issue.id : '',
      product_type: issue?.product_type || ''
    }))
  }

  const handleRemoveIssue = async (issueId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    toast((t) => (
      <div>
        <p className="mb-4 text-sm font-medium text-gray-800">Are you sure you want to remove this issued cloth from the active list? (It will remain in the database)</p>
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
              setIsSubmitting(true)
              try {
                const { error } = await supabase
                  .from('cloth_issues')
                  .update({ is_active: false })
                  .eq('id', issueId)

                if (error) {
                  if (error.message.includes('is_active')) {
                    toast.error('Please run the SQL command to add is_active column first.')
                  } else throw error
                  return
                }
                toast.success('Removed successfully')
                fetchFactoryIssues(selectedFactory)
              } catch (error: any) {
                toast.error('Failed to remove: ' + error.message)
              } finally {
                setIsSubmitting(false)
              }
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    ), { duration: Infinity })
  }

  const quantity = parseInt(formData.output_quantity) || 0
  const rate = parseFloat(formData.rate_per_unit) || 0
  const totalValue = quantity * rate
  const oldBalance = parseFloat(openingBalance) || 0
  const totalDue = oldBalance + totalValue
  const paidNow = parseFloat(formData.paid_amount) || 0
  const newBalance = totalDue - paidNow

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedIssue && !selectedStock) {
      toast.error('Please select an issued cloth or available stock')
      return
    }

    if (quantity <= 0) {
      toast.error('Please enter valid quantity')
      return
    }

    setIsSubmitting(true)

    if (totalDue > 0 && paidNow > totalDue) {
      toast.error(`Paid amount cannot exceed total due (₹${totalDue.toLocaleString('en-IN')})`)
      setIsSubmitting(false)
      return
    } else if (totalDue <= 0 && paidNow > 0) {
      toast.error('Cannot make a payment when there is no due')
      setIsSubmitting(false)
      return
    }

    const factoryName = selectedFactory

    // 1. Create a NEW statement (party record) for this Factory
    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert({
        name: factoryName.trim(),
        party_type: 'factory',
        current_balance: newBalance,
        opening_balance: oldBalance,
        note: formData.note || null
      })
      .select()
      .single()

    if (partyError) {
      toast.error('Failed to create new factory statement')
      setIsSubmitting(false)
      return
    }

    const finalFactoryId = newParty.id

    // 2. Zero out balances from older statements to prevent duplicate balances
    if (factoryName && oldBalance !== 0) {
      const { data: activeStatements } = await supabase
        .from('parties')
        .select('id, current_balance')
        .eq('name', factoryName.trim())
        .eq('party_type', 'factory')
        .neq('current_balance', 0)
        .neq('id', finalFactoryId)

      if (activeStatements) {
        for (const stmt of activeStatements) {
          await supabase.from('parties').update({ current_balance: 0 }).eq('id', stmt.id)
          await supabase.from('ledger_entries').insert({
            party_id: stmt.id,
            entry_type: stmt.current_balance > 0 ? 'debit' : 'credit',
            amount: Math.abs(stmt.current_balance),
            related_type: 'adjustment',
            entry_date: formData.production_date,
            note: 'Old due carried to new statement'
          })
        }
      }
    }

    let currentIssueId = selectedIssue?.id

    if (selectedStock) {
      const issueMeters = parseFloat(metersToIssue)
      if (isNaN(issueMeters) || issueMeters <= 0) {
         toast.error('Please enter a valid number of meters to issue.')
         setIsSubmitting(false)
         return
      }
      if (issueMeters > selectedStock.meters_remaining) {
         toast.error(`Cannot issue more than available stock (${selectedStock.meters_remaining}m).`)
         setIsSubmitting(false)
         return
      }

      const { data: newIssue, error: issueError } = await supabase
        .from('cloth_issues')
        .insert({
          factory_id: finalFactoryId,
          cloth_purchase_id: selectedStock.purchase_id,
          meters_given: issueMeters,
          product_type: formData.product_type,
          issue_date: formData.production_date,
          note: 'Issued directly from production form'
        })
        .select()
        .single()

      if (issueError) {
        toast.error('Failed to issue cloth')
        setIsSubmitting(false)
        return
      }

      currentIssueId = newIssue.id

      await supabase
        .from('cloth_stock')
        .update({ 
          meters_issued: selectedStock.meters_issued + issueMeters
        })
        .eq('id', selectedStock.id)
    }

    const productionData = {
      factory_id: finalFactoryId,
      cloth_issue_id: currentIssueId,
      product_type: formData.product_type,
      output_quantity: quantity,
      output_unit: formData.output_unit,
      rate_per_unit: rate,
      total_value: totalValue,
      paid_amount: parseFloat(formData.paid_amount) || 0,
      production_date: formData.production_date,
      note: formData.note
    }

    // Insert production record
    const { data: production, error: prodError } = await supabase
      .from('production_records')
      .insert(productionData)
      .select()
      .single()

    if (prodError) {
      toast.error('Failed to add production record')
      setIsSubmitting(false)
      return
    }

    // Add ledger entry for factory
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: finalFactoryId,
        entry_type: 'credit',
        amount: totalValue,
        related_type: 'production',
        related_id: production.id,
        entry_date: formData.production_date,
        note: `Production: ${quantity} ${formData.product_type} x ₹${rate}/${formData.output_unit === 'pieces' ? 'piece' : formData.output_unit.replace(/s$/, '')}`
      })

    // If payment made, record it
    if (parseFloat(formData.paid_amount) > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
            party_id: finalFactoryId,
          related_type: 'production',
          related_id: production.id,
          amount: parseFloat(formData.paid_amount),
          payment_date: formData.production_date,
          payment_mode: formData.payment_mode,
          note: `Payment for production: ${formData.product_type}`
        })
        .select()
        .single()

      if (!payError && payment) {
        // Add payment ledger entry
        await supabase
          .from('ledger_entries')
          .insert({
                party_id: finalFactoryId,
            entry_type: 'debit',
            amount: parseFloat(formData.paid_amount),
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.production_date,
            note: `Payment for production: ${formData.product_type}`
          })
      }
    }

    toast.success('Production recorded & new statement created successfully')
    router.push('/production')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Add Ready Garments (from Factory)</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Select Factory */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Factory className="w-4 h-4" />
            Select Factory *
          </label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search factory..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.factory_name) {
                      setFormData({ ...formData, factory_name: '' })
                      setOpeningBalance('')
                    }
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.factory_name && (
                <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                  ✓ Selected
                </span>
              )}
            </div>

            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {factories
                  .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(factory => (
                    <button
                      type="button"
                      key={factory.name}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        fetchFactoryIssues(factory.name)
                        setSearchQuery(factory.name)
                        setOpeningBalance(factory.current_balance.toString())
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      <div className="font-medium">{factory.name}</div>
                      <div className="text-sm text-gray-500">Balance: ₹{factory.current_balance}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Opening Balance */}
        {selectedFactory && (
          <div className="bg-white rounded-xl p-4 border">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Previous Due Balance (₹) {formData.factory_name ? '(Auto-filled)' : '(Optional)'}</label>
              {parseFloat(openingBalance || '0') !== 0 && (
                <button
                  type="button"
                  onClick={() => setOpeningBalance('')}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                >
                  Start Fresh Statement (Set to 0)
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Current balance from existing statement. You can modify this to 0 to start a fresh statement without carrying over previous dues.
            </p>
          </div>
        )}

        {/* Select Cloth Issue */}
        {selectedFactory && (
          <div className="bg-white rounded-xl p-4 border">
            <label className="block text-sm font-medium mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Select Issued Cloth or Available Stock *
            </label>
            
            {(issues.length === 0 && clothStocks.length === 0) ? (
              <p className="text-center py-4 text-gray-500">
                No cloth available
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {issues.length > 0 && (
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">Currently Issued to Factory</div>
                )}
                {issues.map(issue => (
                  <div
                    key={issue.id}
                    onClick={() => handleIssueSelect(issue.id, null)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedIssue?.id === issue.id
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {issue.cloth_purchase?.color_image_url && (
                      <img
                        src={issue.cloth_purchase.color_image_url}
                        alt={issue.cloth_purchase.cloth_color}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">
                        {issue.cloth_purchase?.cloth_name}
                        {issue.cloth_purchase?.cloth_color && ` - ${issue.cloth_purchase.cloth_color}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Issued: {issue.meters_given}m • {issue.product_type || 'No product specified'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(issue.issue_date).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveIssue(issue.id, e)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from active list"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}

                {clothStocks.length > 0 && (
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4 pt-4 border-t">Available Raw Stock</div>
                )}
                {clothStocks.map(stock => (
                  <div
                    key={stock.id}
                    onClick={() => handleIssueSelect(null, stock.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedStock?.id === stock.id
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {stock.purchase?.color_image_url ? (
                      <img src={stock.purchase.color_image_url} alt={stock.cloth_color} className="w-12 h-12 object-cover rounded-lg" />
                    ) : (
                       <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium">
                        {stock.cloth_name}
                        {stock.cloth_color && ` - ${stock.cloth_color}`}
                      </p>
                      <p className="text-sm text-gray-600">
                        Available: {stock.meters_remaining}m
                      </p>
                    </div>
                    <div className="text-right">
                       <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Raw Stock</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedStock && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-blue-900">Meters to Issue for this Production *</label>
              <input type="number" required min="0.01" max={selectedStock.meters_remaining} step="0.01" placeholder="Enter meters used" value={metersToIssue} onChange={(e) => {
                const val = parseFloat(e.target.value) || 0
                if (val > selectedStock.meters_remaining) {
                  setMetersToIssue(selectedStock.meters_remaining.toString())
                } else {
                  setMetersToIssue(e.target.value)
                }
              }} className="w-full px-3 py-3 border rounded-lg border-blue-200 focus:ring-blue-500" />
              <p className="text-xs text-blue-600 mt-1">
                This will automatically issue the cloth from raw stock to {formData.factory_name} and record the production.
              </p>
            </div>
          </div>
        )}

        {/* Production Details */}
        {(selectedIssue || selectedStock) && (
          <div className="bg-white rounded-xl p-4 border space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Product Type</label>
              <input
                type="text"
                required
                placeholder="e.g., Shirts, Pants"
                value={formData.product_type}
                onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Quantity Produced *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={formData.output_quantity}
                  onChange={(e) => setFormData({ ...formData, output_quantity: e.target.value })}
                  className="w-full px-3 py-3 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Unit</label>
                <select
                  value={formData.output_unit}
                  onChange={(e) => setFormData({ ...formData, output_unit: e.target.value })}
                  className="w-full px-3 py-3 border rounded-lg bg-white"
                >
                  <option value="pieces">Pieces</option>
                  <option value="sets">Sets</option>
                  <option value="pairs">Pairs</option>
                  <option value="meters">Meters</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rate Per Unit (₹) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.rate_per_unit}
                onChange={(e) => setFormData({ ...formData, rate_per_unit: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            {/* Auto-calculated totals */}
            {(totalValue > 0 || oldBalance !== 0) && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">New Production Value</span>
                  <span className="font-semibold">₹{totalValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Previous Dues</span>
                  <span className={`font-semibold ${oldBalance > 0 ? 'text-red-600' : oldBalance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {formatBalance(oldBalance)}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-900 font-medium">Total Due</span>
                  <span className="text-lg font-bold">
                    {formatBalance(totalDue)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Amount Paid Now (₹)</label>
                <input
                  type="number"
                  min="0"
                  max={totalDue > 0 ? totalDue : 0}
                  step="0.01"
                  placeholder="0.00"
                  value={formData.paid_amount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    if (totalDue > 0 && val > totalDue) {
                      setFormData({ ...formData, paid_amount: totalDue.toString() })
                    } else if (totalDue <= 0 && val > 0) {
                      setFormData({ ...formData, paid_amount: '' })
                    } else {
                      setFormData({ ...formData, paid_amount: e.target.value })
                    }
                  }}
                  className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Payment Mode</label>
                <select value={formData.payment_mode} onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })} className="w-full px-3 py-3 border rounded-lg bg-white" disabled={!formData.paid_amount || parseFloat(formData.paid_amount) <= 0}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            {/* New Balance Preview */}
            {(totalValue > 0 || oldBalance !== 0) && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="text-blue-900 font-medium">Final Statement Balance</span>
                  <span className={`text-lg font-bold ${newBalance > 0 ? 'text-red-600' : newBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    {formatBalance(newBalance)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Production Date *</label>
              <input
                type="date"
                required
                value={formData.production_date}
                onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Quality check notes, defects, etc."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={(!selectedIssue && !selectedStock) || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Adding...' : 'Add Garments to Stock'}
        </button>
      </form>
    </div>
  )
}