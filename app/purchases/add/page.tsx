'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, X, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Party {
  id: string
  name: string
  current_balance: number
  created_at?: string
}

export default function AddPurchasePage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Party[]>([])
  const [uploading, setUploading] = useState(false)
  const [isNewSupplier, setIsNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [colorPreview, setColorPreview] = useState<string | null>(null)
  const [openingBalance, setOpeningBalance] = useState('')
  const [formData, setFormData] = useState({
    supplier_id: '',
    cloth_name: '',
    cloth_color: '',
    color_image_url: '',
    meters: '',
    rate_per_meter: '',
    paid_amount: '',
    payment_mode: 'cash',
    purchase_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance, created_at')
      .eq('party_type', 'supplier')
      .order('created_at', { ascending: false })

    if (data) {
      const uniqueSuppliers = data.reduce((acc, curr) => {
        const name = curr.name.toLowerCase().trim()
        if (!acc[name]) {
          acc[name] = { ...curr }
        } else {
          acc[name].current_balance = Number(acc[name].current_balance) + Number(curr.current_balance)
        }
        return acc
      }, {} as Record<string, Party>)
      
      setSuppliers(Object.values(uniqueSuppliers).sort((a, b) => a.name.localeCompare(b.name)))
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type and size
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB')
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('cloth-images')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cloth-images')
        .getPublicUrl(fileName)

      setFormData(prev => ({ ...prev, color_image_url: publicUrl }))
      setColorPreview(URL.createObjectURL(file))
      toast.success('Image uploaded successfully')
    } catch (error: any) {
      console.error('Image upload error:', error)
      toast.error(error.message || 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = () => {
    setColorPreview(null)
    setFormData(prev => ({ ...prev, color_image_url: '' }))
  }

  const meters = parseFloat(formData.meters) || 0
  const rate = parseFloat(formData.rate_per_meter) || 0
  const totalAmount = meters * rate
  const oldBalance = parseFloat(openingBalance) || 0
  const totalDue = oldBalance + totalAmount
  const newBalance = totalDue - (parseFloat(formData.paid_amount) || 0)

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let supplierName = ''

    if (isNewSupplier) {
      if (!newSupplierName.trim()) {
        toast.error('Please enter a supplier name')
        return
      }
      supplierName = newSupplierName.trim()
    } else {
      if (!formData.supplier_id) {
        toast.error('Please select a supplier')
        return
      }
      const supplier = suppliers.find(s => s.id === formData.supplier_id)
      supplierName = supplier?.name || ''
    }

    const paidNow = parseFloat(formData.paid_amount) || 0
    if (totalDue > 0 && paidNow > totalDue) {
      toast.error(`Paid amount cannot exceed total due (₹${totalDue.toLocaleString('en-IN')})`)
      return
    } else if (totalDue <= 0 && paidNow > 0) {
      toast.error('Cannot make a payment when there is no due')
      return
    }

    // Always create a new statement row for the transaction
    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert({
        name: supplierName,
        party_type: 'supplier',
        current_balance: newBalance,
        opening_balance: oldBalance,
        note: formData.note || null
      })
      .select()
      .single()

    if (partyError) {
      toast.error('Failed to create supplier statement')
      return
    }

    const finalSupplierId = newParty.id

    // Zero out older statements for this supplier so the sum remains correct
    // This ensures only the newest statement holds the grand total
    if (!isNewSupplier && oldBalance !== 0) {
      const { data: existing } = await supabase
        .from('parties')
        .select('id, name, current_balance')
        .eq('party_type', 'supplier')
        .neq('current_balance', 0)
        .neq('id', finalSupplierId)

      if (existing) {
        const statementsToZero = existing.filter(
          p => p.name.toLowerCase().trim() === supplierName.toLowerCase().trim()
        )

        for (const stmt of statementsToZero) {
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

    const purchaseData = {
      supplier_id: finalSupplierId,
      cloth_name: formData.cloth_name,
      cloth_color: formData.cloth_color,
      color_image_url: formData.color_image_url,
      meters: parseFloat(formData.meters),
      rate_per_meter: parseFloat(formData.rate_per_meter),
      total_amount: totalAmount,
      paid_amount: parseFloat(formData.paid_amount) || 0,
      purchase_date: formData.purchase_date,
      note: formData.note
    }

    // Insert purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('cloth_purchases')
      .insert(purchaseData)
      .select()
      .single()

    if (purchaseError) {
      toast.error('Failed to add purchase')
      return
    }

    // Update cloth stock
    const { error: stockError } = await supabase
      .from('cloth_stock')
      .insert({
        purchase_id: purchase.id,
        cloth_name: formData.cloth_name,
        cloth_color: formData.cloth_color,
        meters_purchased: parseFloat(formData.meters)
      })

    if (stockError) {
      toast.error('Purchase added but stock update failed')
      return
    }

    // Add ledger entry for the purchase (credit = we owe supplier)
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: finalSupplierId,
        entry_type: 'credit',
        amount: totalAmount,
        related_type: 'purchase',
        related_id: purchase.id,
        entry_date: formData.purchase_date,
        note: `Purchase: ${formData.meters}m ${formData.cloth_name} x ₹${formData.rate_per_meter}/meter`
      })

    // Add ledger entry if payment made
    if (parseFloat(formData.paid_amount) > 0) {
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          party_id: finalSupplierId,
          related_type: 'purchase',
          related_id: purchase.id,
          amount: parseFloat(formData.paid_amount),
          payment_date: formData.purchase_date,
          payment_mode: formData.payment_mode,
          note: `Payment for cloth purchase: ${formData.meters}m ${formData.cloth_name}`
        })
        .select()
        .single()

      if (payment) {
        await supabase
          .from('ledger_entries')
          .insert({
            party_id: finalSupplierId,
            entry_type: 'debit',
            amount: parseFloat(formData.paid_amount),
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.purchase_date,
            note: `Payment for purchase: ${formData.meters}m ${formData.cloth_name}`
          })
      }
    }

    toast.success('Purchase added successfully')
    router.push('/purchases')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => router.back()} 
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Add Cloth Purchase</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Supplier Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2">Supplier *</label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search or enter new supplier..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.supplier_id) {
                      setFormData({ ...formData, supplier_id: '' })
                      setOpeningBalance('')
                    }
                    if (isNewSupplier) setIsNewSupplier(false)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.supplier_id && !isNewSupplier && (
                <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                  ✓ Selected
                </span>
              )}
              {isNewSupplier && (
                <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer flex items-center justify-center hover:bg-blue-200 transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </div>

            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {suppliers
                  .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(supplier => (
                    <button
                      type="button"
                      key={supplier.id}
                      onClick={() => {
                        setFormData({ ...formData, supplier_id: supplier.id })
                        setSearchQuery(supplier.name)
                        setOpeningBalance(supplier.current_balance.toString())
                        setIsNewSupplier(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      {supplier.name}
                    </button>
                  ))}
                {searchQuery.trim() && !suppliers.some(s => s.name.toLowerCase().trim() === searchQuery.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewSupplier(true)
                      setNewSupplierName(searchQuery.trim())
                      setFormData({ ...formData, supplier_id: 'new' })
                      setOpeningBalance('')
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                  >
                    + Add "{searchQuery.trim()}" as new supplier
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Opening Balance */}
        <div className="bg-white rounded-xl p-4 border">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">Previous Due Balance (₹) {!isNewSupplier && formData.supplier_id ? '(Auto-filled)' : '(Optional)'}</label>
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
            {!isNewSupplier && formData.supplier_id 
              ? 'Current balance from existing statement. You can modify this to 0 to start a fresh statement without carrying over previous dues.' 
              : 'Set this to carry over any previous dues into this new statement.'}
          </p>
        </div>

        {/* Cloth Details */}
        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cloth Name *</label>
            <input
              type="text"
              required
              placeholder="e.g., Cotton, Silk, Linen"
              value={formData.cloth_name}
              onChange={(e) => setFormData({ ...formData, cloth_name: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Color Name</label>
            <input
              type="text"
              placeholder="e.g., Navy Blue, Crimson Red"
              value={formData.cloth_color}
              onChange={(e) => setFormData({ ...formData, cloth_color: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
          </div>

          {/* Color Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Color Image</label>
            {colorPreview ? (
              <div className="relative inline-block">
                <img 
                  src={colorPreview} 
                  alt="Color preview" 
                  className="w-32 h-32 object-cover rounded-lg border"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <div className="flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">
                    {uploading ? 'Uploading...' : 'Upload color photo'}
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </div>

        {/* Quantity & Pricing */}
        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Meters *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.meters}
                onChange={(e) => setFormData({ ...formData, meters: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rate/Meter (₹) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.rate_per_meter}
                onChange={(e) => setFormData({ ...formData, rate_per_meter: e.target.value })}
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
              <label className="block text-sm font-medium mb-2">Paid Now (₹)</label>
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
                className="w-full px-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
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

        {/* Date & Notes */}
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
              placeholder="Any additional notes..."
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors"
        >
          -&gt;
        </button>
      </form>
    </div>
  )
}