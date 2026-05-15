'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Store, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Party {
  id: string
  name: string
  current_balance: number
  party_type: string
}

export default function AddDirectGarmentsPage() {
  const router = useRouter()
  const [parties, setParties] = useState<Party[]>([])
  const [isNewParty, setIsNewParty] = useState(false)
  const [newPartyName, setNewPartyName] = useState('')
  const [newPartyType, setNewPartyType] = useState<'factory' | 'supplier'>('factory')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [productStocks, setProductStocks] = useState<{ product_type: string, quantity: number }[]>([])
  const [openingBalance, setOpeningBalance] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)
  const [formData, setFormData] = useState({
    party_id: '',
    product_type: '',
    quantity: '',
    rate_per_unit: '',
    paid_amount: '',
    payment_mode: 'cash',
    purchase_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchParties()
    fetchProductStock()
  }, [])

  useEffect(() => {
    if (formData.product_type) {
      const isNew = !productStocks.some(p => p.product_type === formData.product_type)
      setIsNewProduct(isNew)
    }
  }, [formData.product_type, productStocks])

  const fetchParties = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance, party_type')
      .eq('party_type', 'factory')
      .order('name')
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const key = curr.name.toLowerCase().trim() + '-' + curr.party_type
        if (!acc[key]) acc[key] = { ...curr }
        else acc[key].current_balance += Number(curr.current_balance)
        return acc
      }, {} as Record<string, any>)
      setParties(Object.values(grouped))
    }
  }

  const fetchProductStock = async () => {
    const { data: productions } = await supabase
      .from('production_records')
      .select('product_type, output_quantity')
      .gt('output_quantity', 0)

    const { data: sales } = await supabase
      .from('sales')
      .select('product_type, quantity')
      .gt('quantity', 0)

    const productMap = new Map<string, { produced: number, sold: number }>()

    productions?.forEach(p => {
      const type = (p.product_type || '').trim()
      if (!type) return;
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.produced += Number(p.output_quantity)
      productMap.set(capitalizedType, existing)
    })

    sales?.forEach(s => {
      const type = (s.product_type || '').trim()
      if (!type) return;
      const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
      const existing = productMap.get(capitalizedType) || { produced: 0, sold: 0 }
      existing.sold += Number(s.quantity)
      productMap.set(capitalizedType, existing)
    })

    const pStocks = Array.from(productMap.entries()).map(([product_type, { produced, sold }]) => ({
      product_type,
      quantity: Math.max(0, produced - sold)
    })).sort((a, b) => a.product_type.localeCompare(b.product_type));

    setProductStocks(pStocks)
    setProductsLoading(false)
  }

  const quantity = parseInt(formData.quantity) || 0
  const rate = parseFloat(formData.rate_per_unit) || 0
  const totalAmount = quantity * rate
  const oldBalance = parseFloat(openingBalance) || 0
  const totalDue = oldBalance + totalAmount
  const paidNow = parseFloat(formData.paid_amount) || 0
  const newBalance = totalDue - paidNow

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalPartyName = ''
    let finalPartyType = 'factory'

    if (isNewParty) {
      if (!newPartyName.trim()) {
        toast.error('Please enter a party name')
        return
      }
      finalPartyName = newPartyName.trim()
      finalPartyType = newPartyType
    } else {
      if (!formData.party_id) {
        toast.error('Please select a party')
        return
      }
      const party = parties.find(p => p.id === formData.party_id)
      if (party) {
        finalPartyName = party.name
        finalPartyType = party.party_type as 'factory' | 'supplier'
      }
    }

    if (quantity <= 0 || rate <= 0) {
      toast.error('Please enter valid quantity and rate')
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

    // Always create a new statement
    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert({
        name: finalPartyName,
        party_type: finalPartyType,
        current_balance: newBalance,
        opening_balance: oldBalance,
        note: formData.note || null
      })
      .select()
      .single()

    if (partyError) {
      toast.error('Failed to create new party statement')
      setIsSubmitting(false)
      return
    }
    const finalPartyId = newParty.id

    // If carrying over balance from older statements, zero out their balances
    if (!isNewParty && oldBalance !== 0) {
      const { data: activeStatements } = await supabase
        .from('parties')
        .select('id, current_balance')
        .eq('name', finalPartyName)
        .eq('party_type', finalPartyType)
        .neq('current_balance', 0)
        .neq('id', finalPartyId)

      if (activeStatements) {
        for (const stmt of activeStatements) {
          await supabase
            .from('parties')
            .update({ current_balance: 0 })
            .eq('id', stmt.id)

          await supabase
            .from('ledger_entries')
            .insert({
              party_id: stmt.id,
              entry_type: stmt.current_balance > 0 ? 'debit' : 'credit',
              amount: Math.abs(stmt.current_balance),
              related_type: 'adjustment',
              entry_date: formData.purchase_date,
              note: 'Old due carried to new statement'
            })
        }
      }
    }

    const productionData = {
      factory_id: finalPartyId,
      product_type: formData.product_type,
      output_quantity: quantity,
      output_unit: 'pieces',
      rate_per_unit: rate,
      total_value: totalAmount,
      paid_amount: paidNow,
      production_date: formData.purchase_date,
      note: 'Direct Garment Purchase - ' + formData.note
    }

    // Insert production record
    const { data: production, error: prodError } = await supabase
      .from('production_records')
      .insert(productionData)
      .select()
      .single()

    if (prodError) {
      toast.error('Failed to record direct garment purchase')
      setIsSubmitting(false)
      return
    }

    // Add ledger entry for party (credit = they supplied goods, we owe them)
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: finalPartyId,
        entry_type: 'credit',
        amount: totalAmount,
        related_type: 'production',
        related_id: production.id,
        entry_date: formData.purchase_date,
        note: `Direct Garments: ${quantity} ${formData.product_type} x ₹${rate}/piece`
      })

    // Add payment if made
    if (paidNow > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
          party_id: finalPartyId,
          related_type: 'production',
          related_id: production.id,
          amount: paidNow,
          payment_date: formData.purchase_date,
          payment_mode: formData.payment_mode,
          note: `Payment for direct garments: ${formData.product_type}`
        })
        .select()
        .single()

      if (!payError && payment) {
        await supabase
          .from('ledger_entries')
          .insert({
            party_id: finalPartyId,
            entry_type: 'debit',
            amount: paidNow,
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.purchase_date,
            note: `Payment for direct garments: ${formData.product_type}`
          })
      }
    }

    toast.success('Direct garments recorded successfully')
    router.push('/production')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Add Direct Garments</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Party Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Store className="w-4 h-4" />
            Factory *
          </label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search or enter new party..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.party_id) {
                      setFormData({ ...formData, party_id: '' })
                      setOpeningBalance('')
                    }
                    if (isNewParty) setIsNewParty(false)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.party_id && !isNewParty && (
                <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                  ✓ Selected
                </span>
              )}
            </div>

            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {parties
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(party => (
                    <button
                      type="button"
                      key={party.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setFormData({ ...formData, party_id: party.id })
                        setSearchQuery(party.name)
                        setOpeningBalance(party.current_balance.toString())
                        setIsNewParty(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      <div className="font-medium">{party.name}</div>
                      <div className="text-sm text-gray-500 capitalize">{party.party_type} • Balance: ₹{party.current_balance}</div>
                    </button>
                  ))}
                {searchQuery.trim() && !parties.some(p => p.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <div className="p-2 bg-blue-50 border-t">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setIsNewParty(true)
                        setNewPartyName(searchQuery.trim())
                        setNewPartyType('factory')
                        setFormData({ ...formData, party_id: 'new' })
                        setOpeningBalance('')
                        setShowDropdown(false)
                      }}
                      className="w-full py-2 bg-white rounded border hover:bg-blue-100 text-sm font-medium text-blue-700"
                    >
                      + Add "{searchQuery.trim()}" as new factory
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Opening Balance */}
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">Previous Due Balance (₹) {!isNewParty && formData.party_id ? '(Auto-filled)' : '(Optional)'}</label>
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
            {!isNewParty && formData.party_id 
              ? 'Current balance from existing statement. You can modify this to 0 to start a fresh statement without carrying over previous dues.' 
              : 'Set this to carry over any previous dues into this new statement.'}
          </p>
        </div>

        {/* Garment Details */}
        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Product Type *</label>
            <div className="relative">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder={productsLoading ? 'Loading products...' : 'Search or enter new product...'}
                    value={productSearchQuery}
                    onChange={(e) => {
                      setProductSearchQuery(e.target.value)
                      setShowProductDropdown(true)
                      if (formData.product_type) setFormData({ ...formData, product_type: '' })
                      if (isNewProduct) setIsNewProduct(false)
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                    className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                    disabled={productsLoading}
                    required
                  />
                </div>
                {formData.product_type && !isNewProduct && (
                  <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                    ✓ Selected
                  </span>
                )}
                {isNewProduct && (
                  <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 mr-1" /> New
                  </span>
                )}
              </div>

              {showProductDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {productStocks
                    .filter(p => p.product_type.toLowerCase().includes(productSearchQuery.toLowerCase()))
                    .map(stock => (
                      <button type="button" key={stock.product_type} onMouseDown={(e) => e.preventDefault()} onClick={() => {
                        setFormData({ ...formData, product_type: stock.product_type })
                        setProductSearchQuery(stock.product_type)
                        setShowProductDropdown(false)
                      }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0">
                        <div className="font-medium">{stock.product_type}</div>
                        <div className="text-sm text-gray-500">Currently in stock: {stock.quantity}</div>
                      </button>
                    ))}
                  {productSearchQuery.trim() && !productStocks.some(p => p.product_type.toLowerCase() === productSearchQuery.toLowerCase()) && (
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                      const newProduct = productSearchQuery.trim()
                      const capitalizedNewProduct = newProduct.charAt(0).toUpperCase() + newProduct.slice(1).toLowerCase()
                      setFormData({ ...formData, product_type: capitalizedNewProduct })
                      setProductSearchQuery(capitalizedNewProduct)
                      setShowProductDropdown(false)
                    }} className="w-full text-left px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                      + Add "{productSearchQuery.trim()}" as new product
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Quantity (Pieces) *</label>
              <input
                type="number"
                required
                min="1"
                placeholder="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rate/Piece (₹) *</label>
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
          </div>

          {/* Purchase Summary */}
          {(totalAmount > 0 || oldBalance !== 0) && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">New Purchase Amount</span>
                <span className="font-semibold">₹{totalAmount.toLocaleString('en-IN')}</span>
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
              <select
                value={formData.payment_mode}
                onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none bg-white"
                disabled={!formData.paid_amount || parseFloat(formData.paid_amount) <= 0}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>

          {/* New Balance Preview */}
          {(totalAmount > 0 || oldBalance !== 0) && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="text-blue-900 font-medium">Final Statement Balance</span>
                <span className={`text-lg font-bold ${newBalance > 0 ? 'text-red-600' : newBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                  {formatBalance(newBalance)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Date & Note */}
        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Purchase Date *</label>
            <input
              type="date"
              required
              value={formData.purchase_date}
              onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Note</label>
            <textarea
              rows={2}
              placeholder="Any additional details..."
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={(!formData.party_id && !isNewParty) || !formData.product_type || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Recording...' : 'Record Direct Garment Purchase'}
        </button>
      </form>
    </div>
  )
}
