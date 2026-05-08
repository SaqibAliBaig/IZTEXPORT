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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerOpeningBalance, setNewCustomerOpeningBalance] = useState('0')
  const [searchQuery, setSearchQuery] = useState('')
  const [productStocks, setProductStocks] = useState<{ product_type: string, quantity: number }[]>([])
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [productsLoading, setProductsLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    customer_id: '',
    product_type: '',
    quantity: '',
    rate: '',
    paid_amount: '0',
    sale_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchCustomers()
    fetchProductStock()
  }, [])

  useEffect(() => {
    if (!isNewCustomer) {
      setNewCustomerOpeningBalance('0')
    }
  }, [isNewCustomer])

  useEffect(() => {
    if (formData.product_type) {
      const isNew = !productStocks.some(p => p.product_type === formData.product_type)
      setIsNewProduct(isNew)
    }
  }, [formData.product_type, productStocks])

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('parties')
      .select('*')
      .eq('party_type', 'customer')
      .order('name')
    if (data) setCustomers(data)
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
      quantity: produced - sold
    })).filter(p => p.quantity > 0).sort((a, b) => a.product_type.localeCompare(b.product_type));

    setProductStocks(pStocks)
    setProductsLoading(false)
  }

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId)
    setSelectedCustomer(customer || null)
    setFormData(prev => ({ ...prev, customer_id: customerId }))
  }

  const quantity = parseInt(formData.quantity) || 0
  const rate = parseFloat(formData.rate) || 0
  const totalAmount = quantity * rate
  const oldBalance = isNewCustomer ? (parseFloat(newCustomerOpeningBalance) || 0) : (selectedCustomer?.current_balance || 0)
  const openingBalance = isNewCustomer ? (parseFloat(newCustomerOpeningBalance) || 0) : (selectedCustomer?.opening_balance || 0)
  const totalDue = oldBalance + totalAmount
  const paidNow = parseFloat(formData.paid_amount) || 0
  const newBalance = totalDue - paidNow

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting) return;

    let finalCustomerId = formData.customer_id

    if (isNewCustomer) {
      if (!newCustomerName.trim()) {
        toast.error('Please enter a customer name')
        return
      }
      const { data: newParty, error: partyError } = await supabase
        .from('parties')
        .insert({
          name: newCustomerName.trim(),
          party_type: 'customer',
          current_balance: parseFloat(newCustomerOpeningBalance) || 0,
          opening_balance: parseFloat(newCustomerOpeningBalance) || 0
        })
        .select()
        .single()

      if (partyError) {
        toast.error('Failed to create new customer')
        return
      }
      finalCustomerId = newParty.id
    } else if (!finalCustomerId) {
      toast.error('Please select a customer')
      return
    }

    if (quantity <= 0 || rate <= 0) {
      toast.error('Please enter valid quantity and rate')
      return
    }

    const availableStock = productStocks.find(p => p.product_type === formData.product_type)?.quantity;
    if (availableStock !== undefined && quantity > availableStock) {
      toast.error(`Cannot sell more than available stock (${availableStock})`);
      return;
    }

    setIsSubmitting(true)

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

    // Update customer balance
    const { error: updateError } = await supabase
      .from('parties')
      .update({ 
        current_balance: newBalance
      })
      .eq('id', finalCustomerId)

    if (updateError) {
      console.error('Failed to update balance:', updateError)
    }

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
          payment_mode: 'cash',
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

    toast.success('Sale recorded successfully')
    router.push('/sales')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Record Customer Sale</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Customer *
          </label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search or enter new customer..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.customer_id) {
                      setFormData({ ...formData, customer_id: '' })
                      setSelectedCustomer(null)
                    }
                    if (isNewCustomer) setIsNewCustomer(false)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.customer_id && !isNewCustomer && (
                <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                  ✓ Selected
                </span>
              )}
              {isNewCustomer && (
                <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer flex items-center justify-center hover:bg-blue-200 transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </div>

            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {customers
                  .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(customer => (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => {
                        handleCustomerSelect(customer.id)
                        setSearchQuery(customer.name)
                        setIsNewCustomer(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-sm text-gray-500">Balance: ₹{customer.current_balance}</div>
                    </button>
                  ))}
                {searchQuery.trim() && !customers.some(c => c.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewCustomer(true)
                      setNewCustomerName(searchQuery.trim())
                      setFormData({ ...formData, customer_id: 'new' })
                      setSelectedCustomer(null)
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                  >
                    + Add "{searchQuery.trim()}" as new customer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Opening Balance for New Customer */}
        {isNewCustomer && (
          <div className="bg-white rounded-xl p-4 border">
            <label className="block text-sm font-medium mb-2">Opening Balance for New Customer (₹)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={newCustomerOpeningBalance}
              onChange={(e) => setNewCustomerOpeningBalance(e.target.value)}
              className="w-full px-3 py-3 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Set this if the new customer has a pre-existing balance to carry over.</p>
          </div>
        )}

        {/* Customer Balance Display */}
        {!isNewCustomer && selectedCustomer && (
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-orange-600">Existing Balance</p>
                <p className="text-lg font-bold text-orange-700">
                  ₹{oldBalance.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-orange-600">Opening Balance</p>
                <p className="text-lg font-bold text-orange-700">
                  ₹{openingBalance.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sale Details */}
        {(selectedCustomer || isNewCustomer) && (
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
                    />
                  </div>
                  {formData.product_type && !isNewProduct && (
                    <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                      ✓ In Stock
                    </span>
                  )}
                  {isNewProduct && (
                    <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer flex items-center justify-center hover:bg-blue-200 transition-colors">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </div>

                {showProductDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {productStocks
                      .filter(p => p.product_type.toLowerCase().includes(productSearchQuery.toLowerCase()))
                      .map(stock => (
                        <button type="button" key={stock.product_type} onClick={() => {
                          setFormData({ ...formData, product_type: stock.product_type })
                          setProductSearchQuery(stock.product_type)
                          setShowProductDropdown(false)
                        }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0">
                          <div className="font-medium">{stock.product_type}</div>
                          <div className="text-sm text-gray-500">Available: {stock.quantity}</div>
                        </button>
                      ))}
                    {productSearchQuery.trim() && !productStocks.some(p => p.product_type.toLowerCase() === productSearchQuery.toLowerCase()) && (
                      <button type="button" onClick={() => {
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
                  max={productStocks.find(p => p.product_type === formData.product_type)?.quantity}
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
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  className="w-full px-3 py-3 border rounded-lg"
                />
              </div>
            </div>

            {/* Sale Summary */}
            {totalAmount > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">New Sale Amount</span>
                  <span className="font-semibold">₹{totalAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Old Balance</span>
                  <span className="font-semibold text-orange-600">₹{oldBalance.toLocaleString('en-IN')}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-900 font-medium">Total Due</span>
                  <span className="text-lg font-bold">₹{totalDue.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Amount Received Now (₹)</label>
              <input
                type="number"
                min="0"
                max={totalDue}
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            {/* New Balance Preview */}
            {totalAmount > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="text-blue-900 font-medium">New Balance After This Sale</span>
                  <span className={`text-lg font-bold ${newBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹{newBalance.toLocaleString('en-IN')}
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
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Any additional notes..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={(!selectedCustomer && !isNewCustomer) || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Recording...' : 'Record Sale'}
        </button>
      </form>
    </div>
  )
}