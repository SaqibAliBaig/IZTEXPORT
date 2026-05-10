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
  const [formData, setFormData] = useState({
    party_id: '',
    product_type: '',
    quantity: '',
    rate_per_unit: '',
    paid_amount: '0',
    purchase_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchParties()
  }, [])

  const fetchParties = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance, party_type')
      .in('party_type', ['factory', 'supplier'])
      .order('name')
    if (data) setParties(data)
  }

  const quantity = parseInt(formData.quantity) || 0
  const rate = parseFloat(formData.rate_per_unit) || 0
  const totalAmount = quantity * rate
  const dueAmount = totalAmount - (parseFloat(formData.paid_amount) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalPartyId = formData.party_id
    let currentPartyBalance = 0

    if (isNewParty) {
      if (!newPartyName.trim()) {
        toast.error('Please enter a party name')
        return
      }
      const { data: newParty, error: partyError } = await supabase
        .from('parties')
        .insert({
          name: newPartyName.trim(),
          party_type: newPartyType,
          current_balance: 0,
          opening_balance: 0
        })
        .select()
        .single()

      if (partyError) {
        toast.error('Failed to create new party')
        return
      }
      finalPartyId = newParty.id
    } else {
      if (!finalPartyId) {
        toast.error('Please select a party')
        return
      }
      const party = parties.find(p => p.id === finalPartyId)
      currentPartyBalance = party?.current_balance || 0
    }

    if (quantity <= 0 || rate <= 0) {
      toast.error('Please enter valid quantity and rate')
      return
    }

    setIsSubmitting(true)

    const productionData = {
      factory_id: finalPartyId,
      product_type: formData.product_type,
      output_quantity: quantity,
      output_unit: 'pieces',
      rate_per_unit: rate,
      total_value: totalAmount,
      paid_amount: parseFloat(formData.paid_amount) || 0,
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
        note: `Direct Garments: ${quantity} ${formData.product_type}`
      })

    // Add payment if made
    if (parseFloat(formData.paid_amount) > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
          party_id: finalPartyId,
          related_type: 'production',
          related_id: production.id,
          amount: parseFloat(formData.paid_amount),
          payment_date: formData.purchase_date,
          payment_mode: 'cash',
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
            amount: parseFloat(formData.paid_amount),
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.purchase_date,
            note: `Payment made for direct garments`
          })
      }
    }

    // Update party balance
    const newBalance = currentPartyBalance + dueAmount

    const { error: updateError } = await supabase
      .from('parties')
      .update({ current_balance: newBalance })
      .eq('id', finalPartyId)

    if (updateError) {
      console.error('Failed to update party balance:', updateError)
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
            Supplier / Factory *
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
                    if (formData.party_id) setFormData({ ...formData, party_id: '' })
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
                      onClick={() => {
                        setFormData({ ...formData, party_id: party.id })
                        setSearchQuery(party.name)
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
                    <p className="text-sm font-medium text-blue-800 mb-2 px-2">Add as new:</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setIsNewParty(true)
                          setNewPartyName(searchQuery.trim())
                          setNewPartyType('factory')
                          setFormData({ ...formData, party_id: 'new' })
                          setShowDropdown(false)
                        }}
                        className="flex-1 py-2 bg-white rounded border hover:bg-blue-100 text-sm font-medium"
                      >
                        + Factory
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setIsNewParty(true)
                          setNewPartyName(searchQuery.trim())
                          setNewPartyType('supplier')
                          setFormData({ ...formData, party_id: 'new' })
                          setShowDropdown(false)
                        }}
                        className="flex-1 py-2 bg-white rounded border hover:bg-blue-100 text-sm font-medium"
                      >
                        + Supplier
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Garment Details */}
        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Product Type *</label>
            <input
              type="text"
              required
              placeholder="e.g., T-Shirts, Jeans, Jackets"
              value={formData.product_type}
              onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg"
            />
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

          {totalAmount > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Purchase Value</span>
                <span className="text-lg font-bold">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Amount Paid Now (₹)</label>
              <input
                type="number"
                min="0"
                max={totalAmount > 0 ? totalAmount : undefined}
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Due Amount</label>
              <div className="w-full px-3 py-3 bg-gray-50 border rounded-lg">
                <span className="text-orange-600 font-medium">₹{dueAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
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
          disabled={(!formData.party_id && !isNewParty) || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Recording...' : 'Record Direct Garment Purchase'}
        </button>
      </form>
    </div>
  )
}
