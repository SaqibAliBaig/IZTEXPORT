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
  const [formData, setFormData] = useState({
    supplier_id: '',
    cloth_name: '',
    cloth_color: '',
    color_image_url: '',
    meters: '',
    rate_per_meter: '',
    paid_amount: '0',
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
  const dueAmount = totalAmount - (parseFloat(formData.paid_amount) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let supplierName = ''
    let openingBalance = 0

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
      openingBalance = supplier?.current_balance || 0
    }

    const finalCurrentBalance = openingBalance + dueAmount

    // Always create a new statement row for the transaction
    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert({
        name: supplierName,
        party_type: 'supplier',
        current_balance: finalCurrentBalance,
        opening_balance: openingBalance
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
    if (!isNewSupplier) {
      const { data: existing } = await supabase
        .from('parties')
        .select('id, name')
        .eq('party_type', 'supplier')

      if (existing) {
        const idsToZero = existing
          .filter(p => p.name.toLowerCase().trim() === supplierName.toLowerCase().trim() && p.id !== finalSupplierId)
          .map(p => p.id)

        if (idsToZero.length > 0) {
          await supabase
            .from('parties')
            .update({ current_balance: 0 })
            .in('id', idsToZero)
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
          payment_mode: 'cash',
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
                    if (formData.supplier_id) setFormData({ ...formData, supplier_id: '' })
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

          {/* Auto-calculated totals */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Total Amount</span>
              <span className="text-lg font-bold">₹{totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Paid Now (₹)</label>
              <input
                type="number"
                min="0"
                max={totalAmount}
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Current Bill Due</label>
              <div className="w-full px-3 py-3 bg-gray-50 border rounded-lg">
                <span className="text-orange-600 font-medium">₹{dueAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {formData.supplier_id && formData.supplier_id !== 'new' && (
            <div className="bg-orange-50 rounded-lg p-4 mt-2 border border-orange-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-orange-800">Previous Owed Balance</span>
                <span className="font-medium text-orange-800">
                  ₹{(suppliers.find(s => s.id === formData.supplier_id)?.current_balance || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-orange-200 pt-2">
                <span className="font-bold text-orange-900">Total Supplier Due</span>
                <span className="text-lg font-bold text-red-600">
                  ₹{((suppliers.find(s => s.id === formData.supplier_id)?.current_balance || 0) + dueAmount).toLocaleString('en-IN')}
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