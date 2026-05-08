'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, DollarSign, Users, Factory, Package, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Party {
  id: string
  name: string
  party_type: string
  current_balance: number
}

export default function AddPaymentPage() {
  const router = useRouter()
  const [parties, setParties] = useState<Party[]>([])
  const [selectedParty, setSelectedParty] = useState<Party | null>(null)
  const [partyType, setPartyType] = useState<'customer' | 'factory' | 'supplier'>('customer')
  const [isNewParty, setIsNewParty] = useState(false)
  const [newPartyName, setNewPartyName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [formData, setFormData] = useState({
    party_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'cash',
    note: ''
  })

  useEffect(() => {
    if (partyType) {
      fetchParties(partyType)
      setIsNewParty(false)
      setNewPartyName('')
      setSelectedParty(null)
      setFormData(prev => ({ ...prev, party_id: '' }))
      setSearchQuery('')
      setShowDropdown(false)
    }
  }, [partyType])

  const fetchParties = async (type: string) => {
    const { data } = await supabase
      .from('parties')
      .select('*')
      .eq('party_type', type)
      .order('name')
    if (data) setParties(data)
  }

  const handlePartySelect = (partyId: string) => {
    const party = parties.find(p => p.id === partyId)
    setSelectedParty(party || null)
    setFormData(prev => ({ ...prev, party_id: partyId }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalPartyId = formData.party_id
    let currentPartyBalance = 0

    if (isNewParty) {
      if (!newPartyName.trim()) {
        toast.error('Please enter a party name')
        return
      }
      const { data: newPartyObj, error: partyError } = await supabase
        .from('parties')
        .insert({
          name: newPartyName.trim(),
          party_type: partyType,
          current_balance: 0,
          opening_balance: 0
        })
        .select()
        .single()

      if (partyError) {
        toast.error('Failed to create new party')
        return
      }
      finalPartyId = newPartyObj.id
    } else {
      if (!finalPartyId || !selectedParty) {
        toast.error('Please select a party')
        return
      }
      currentPartyBalance = selectedParty.current_balance
    }

    const paymentAmount = parseFloat(formData.amount)
    
    if (paymentAmount === 0 || isNaN(paymentAmount)) {
      toast.error('Please enter a valid non-zero amount')
      return
    }

    // Insert payment record
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .insert({
        party_id: finalPartyId,
        amount: paymentAmount,
        payment_date: formData.payment_date,
        payment_mode: formData.payment_mode,
        note: formData.note
      })
      .select()
      .single()

    if (payError) {
      toast.error('Failed to record payment')
      return
    }

    // Add ledger entry
    const entryType = partyType === 'customer' ? 'credit' : 'debit'
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: finalPartyId,
        entry_type: entryType,
        amount: paymentAmount,
        related_type: 'payment',
        related_id: payment.id,
        entry_date: formData.payment_date,
        note: formData.note || `Payment via ${formData.payment_mode}`
      })

    // Update party balance
    const newBalance = currentPartyBalance - paymentAmount
    const { error: updateError } = await supabase
      .from('parties')
      .update({ current_balance: newBalance })
      .eq('id', finalPartyId)

    if (updateError) {
      console.error('Failed to update balance:', updateError)
    }

    toast.success('Payment recorded successfully')
    router.push('/payments')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Record Payment</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Party Type Tabs */}
        <div className="grid grid-cols-3 gap-2 bg-white rounded-xl p-2 border">
          <button
            type="button"
            onClick={() => setPartyType('customer')}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg transition-colors ${
              partyType === 'customer' ? 'bg-black text-white' : 'text-gray-600'
            }`}
          >
            <Users className="w-4 h-4" />
            Customer
          </button>
          <button
            type="button"
            onClick={() => setPartyType('factory')}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg transition-colors ${
              partyType === 'factory' ? 'bg-black text-white' : 'text-gray-600'
            }`}
          >
            <Factory className="w-4 h-4" />
            Factory
          </button>
          <button
            type="button"
            onClick={() => setPartyType('supplier')}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg transition-colors ${
              partyType === 'supplier' ? 'bg-black text-white' : 'text-gray-600'
            }`}
          >
            <Package className="w-4 h-4" />
            Supplier
          </button>
        </div>

        {/* Party Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2">Select Party *</label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder={`Search or enter new ${partyType}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.party_id) {
                      setFormData({ ...formData, party_id: '' })
                      setSelectedParty(null)
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
              {isNewParty && (
                <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer flex items-center justify-center hover:bg-blue-200 transition-colors">
                  <ArrowRight className="w-4 h-4" />
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
                        handlePartySelect(party.id)
                        setSearchQuery(party.name)
                        setIsNewParty(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      <div className="font-medium">{party.name}</div>
                      <div className="text-sm text-gray-500">Balance: ₹{party.current_balance}</div>
                    </button>
                  ))}
                {searchQuery.trim() && !parties.some(p => p.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewParty(true)
                      setNewPartyName(searchQuery.trim())
                      setFormData({ ...formData, party_id: 'new' })
                      setSelectedParty(null)
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium capitalize"
                  >
                    + Add "{searchQuery.trim()}" as new {partyType}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Party Balance */}
        {!isNewParty && selectedParty && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex justify-between items-center">
              <span className="text-blue-900">{selectedParty.name}</span>
              <span className="text-lg font-bold text-blue-900">
                Balance: ₹{selectedParty.current_balance.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* Payment Details */}
        {(selectedParty || isNewParty) && (
          <div className="bg-white rounded-xl p-4 border space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Amount (₹) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                placeholder="Enter amount"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg text-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Payment Date *</label>
              <input
                type="date"
                required
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Payment Mode</label>
              <select
                value={formData.payment_mode}
                onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg bg-white"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Payment reference or note..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedParty && !isNewParty}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Record Payment
        </button>
      </form>
    </div>
  )
}