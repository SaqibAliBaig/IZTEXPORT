'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, Package, DollarSign, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Customer {
  id: string
  name: string
  current_balance: number
  opening_balance: number
}

export default function AddSalePage() {
  const router = useRouter()
  const [uniqueCustomerNames, setUniqueCustomerNames] = useState<string[]>([])
  const [customersList, setCustomersList] = useState<{id: string, name: string, current_balance: number}[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{id: string, name: string, current_balance: number} | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [productStocks, setProductStocks] = useState<{ product_type: string, quantity: number }[]>([])
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    product_type: '',
    quantity: '',
    rate: '',
    paid_amount: '',
    payment_mode: 'cash',
    sale_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchCustomers()
    fetchProductStock()
  }, [])

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance')
      .eq('party_type', 'customer')
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const name = curr.name.toLowerCase().trim()
        if (!acc[name]) acc[name] = { ...curr }
        else acc[name].current_balance += Number(curr.current_balance)
        return acc
      }, {} as Record<string, any>)
      setCustomersList(Object.values(grouped))
      const names = Array.from(new Set(data.map(c => c.name))).sort()
      setUniqueCustomerNames(names)
    }
  }

  useEffect(() => {
    const found = customersList.find(c => c.name.toLowerCase() === customerName.toLowerCase())
    if (found) {
      setSelectedCustomer(found)
      setOpeningBalance(found.current_balance.toString())
    } else {
      setSelectedCustomer(null)
    }
  }, [customerName, customersList])

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
    }))
    .filter(p => p.quantity > 0)
    .sort((a, b) => a.product_type.localeCompare(b.product_type));

    setProductStocks(pStocks)
    setProductsLoading(false)
  }

  const quantity = parseInt(formData.quantity) || 0
  const rate = parseFloat(formData.rate) || 0
  const totalAmount = quantity * rate
  const oldBalance = parseFloat(openingBalance) || 0
  const totalDue = oldBalance + totalAmount
  const paidNow = parseFloat(formData.paid_amount) || 0
  const newBalance = totalDue - paidNow
  const availableStock = productStocks.find(p => p.product_type.toLowerCase() === formData.product_type.toLowerCase())?.quantity || 0
  const remainingStock = availableStock - quantity

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting) return;

    if (!customerName.trim()) {
      toast.error('Please enter a customer name')
      return
    }

    if (quantity <= 0 || rate <= 0) {
      toast.error('Please enter valid quantity and rate')
      return
    }

    if (totalDue > 0 && paidNow > totalDue) {
      toast.error(`Paid amount cannot exceed total due (₹${totalDue.toLocaleString('en-IN')})`)
      return
    } else if (totalDue <= 0 && paidNow > 0) {
      toast.error('Cannot make a payment when there is no due')
      return
    }

    setIsSubmitting(true)

    let finalCustomerId = ''

    // Always create a new statement for a new sale from this page
    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert({
        name: customerName.trim(),
        party_type: 'customer',
        current_balance: newBalance,
        opening_balance: oldBalance,
        note: formData.note || null
      })
      .select()
      .single()

    if (partyError) {
      toast.error('Failed to create new customer statement')
      setIsSubmitting(false)
      return
    }
    finalCustomerId = newParty.id

    // If carrying over balance from older statements, zero out their balances
    if (selectedCustomer && oldBalance !== 0) {
      const { data: activeStatements } = await supabase
        .from('parties')
        .select('id, current_balance')
        .eq('name', customerName.trim())
        .eq('party_type', 'customer')
        .neq('current_balance', 0)
        .neq('id', finalCustomerId)

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
              entry_type: stmt.current_balance > 0 ? 'credit' : 'debit',
              amount: Math.abs(stmt.current_balance),
              related_type: 'adjustment',
              entry_date: formData.sale_date,
              note: 'Balance carried forward to new statement'
            })
        }
      }
    }

    const saleData = {
      customer_id: finalCustomerId,
      product_type: formData.product_type,
      quantity: quantity,
      rate: rate,
      total_amount: totalAmount,
      old_balance: oldBalance,
      paid_amount: paidNow,
      sale_date: formData.sale_date,
      note: formData.note
    }

    // Insert sale record
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert(saleData)
      .select()
      .single()

    if (saleError) {
      toast.error('Failed to record sale')
      setIsSubmitting(false)
      return
    }

    // Add ledger entry for customer (debit = customer owes us)
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: finalCustomerId,
        entry_type: 'debit',
        amount: totalAmount,
        related_type: 'sale',
        related_id: sale.id,
        entry_date: formData.sale_date,
        note: `Sale: ${quantity} ${formData.product_type} @ ₹${rate} each`
      })

    // If payment made, record it
    if (paidNow > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
          party_id: finalCustomerId,
          related_type: 'sale',
          related_id: sale.id,
          amount: paidNow,
          payment_date: formData.sale_date,
          payment_mode: formData.payment_mode,
          note: `Payment for sale: ${formData.product_type}`
        })
        .select()
        .single()

      if (!payError && payment) {
        // Add payment ledger entry
        await supabase
          .from('ledger_entries')
          .insert({
            party_id: finalCustomerId,
            entry_type: 'credit',
            amount: paidNow,
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.sale_date,
            note: `Payment received`
          })
      }
    }

    toast.success('New statement and sale recorded successfully')
    router.push('/sales')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">New Sale & Statement</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Customer Name *
          </label>
          <div className="relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Enter customer name..."
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                required
              />
            </div>
            {showCustomerDropdown && uniqueCustomerNames.filter(n => n.toLowerCase().includes(customerName.toLowerCase())).length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {uniqueCustomerNames
                  .filter(name => name.toLowerCase().includes(customerName.toLowerCase()))
                  .map(name => (
                    <button
                      type="button"
                      key={name}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCustomerName(name)
                        setShowCustomerDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 font-medium"
                    >
                      {name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Opening Balance */}
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">Previous Unpaid Balance (₹) {selectedCustomer ? '(Auto-filled)' : '(Optional)'}</label>
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
            {selectedCustomer 
              ? 'Current balance from existing statement. You can modify this to 0 to start a fresh statement without carrying over previous dues.' 
              : 'Set this to carry over any previous unpaid dues into this new statement.'}
          </p>
        </div>

        {/* Sale Details */}
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
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                    className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                    disabled={productsLoading}
                    required
                  />
                </div>
                {formData.product_type && productStocks.some(p => p.product_type.toLowerCase() === formData.product_type.toLowerCase()) && (
                  <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                    ✓ In Stock
                  </span>
                )}
                {formData.product_type && !productStocks.some(p => p.product_type.toLowerCase() === formData.product_type.toLowerCase()) && (
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
                        <div className="text-sm text-gray-500">Available: {stock.quantity}</div>
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
              <label className="block text-sm font-medium mb-2">Quantity *</label>
              <input
                type="number"
                required
                min="1"
                placeholder="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
              />
              {formData.product_type && (
                <div className="flex justify-between items-center mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-md border">
                  <span>In Stock: <span className="font-bold text-gray-800">{availableStock}</span></span>
                  {quantity > 0 && (
                    <span>Remaining: <span className={`font-bold ${remainingStock < 0 ? 'text-red-600' : 'text-blue-600'}`}>{remainingStock}</span></span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rate/Piece (₹) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
              />
            </div>
          </div>

          {/* Sale Summary */}
          {(totalAmount > 0 || oldBalance > 0) && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">New Sale Amount</span>
                <span className="font-semibold">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Previous Dues</span>
                <span className="font-semibold text-orange-600">
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
            <label className="block text-sm font-medium mb-2">Amount Received Now (₹)</label>
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
          {(totalAmount > 0 || oldBalance > 0) && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="text-blue-900 font-medium">Final Statement Balance</span>
                <span className={`text-lg font-bold ${newBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatBalance(newBalance)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Sale Date *</label>
            <input
              type="date"
              required
              value={formData.sale_date}
              onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Note (Optional)</label>
            <textarea
              rows={2}
              placeholder="Any additional notes..."
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !customerName.trim() || !formData.product_type}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Recording...' : 'Record Sale & Create Statement'}
        </button>
      </form>
    </div>
  )
}