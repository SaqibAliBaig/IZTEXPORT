'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Customer {
  id: string
  name: string
  current_balance: number
  phone?: string
  address?: string
}

export default function AddBalancePage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const getTodayLocal = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    customer_id: '',
    amount: '',
    date: getTodayLocal(),
    note: 'Opening Balance',
    details: '',
    internalNote: ''
  })

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance, phone, address')
      .eq('party_type', 'customer')
      .order('name')
      
    if (data) {
      const grouped = data.reduce((acc, curr) => {
        const key = curr.name.toLowerCase().trim()
        if (!acc[key]) acc[key] = { ...curr }
        else acc[key].current_balance += Number(curr.current_balance)
        return acc
      }, {} as Record<string, any>)
      setCustomers(Object.values(grouped))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let finalCustomerName = ''

    if (isNewCustomer) {
      if (!customerName.trim()) {
        toast.error('Please enter a customer name')
        return
      }
      finalCustomerName = customerName.trim()
    } else {
      if (!formData.customer_id) {
        toast.error('Please select a customer')
        return
      }
      const customer = customers.find(c => c.id === formData.customer_id)
      if (customer) {
        finalCustomerName = customer.name
      }
    }

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsSubmitting(true)

    try {
      let customerPhone = null
      let customerAddress = null

      if (!isNewCustomer && formData.customer_id) {
        const customer = customers.find(c => c.id === formData.customer_id)
        if (customer) {
          customerPhone = customer.phone
          customerAddress = customer.address
        }
      }

      const finalNote = formData.details.trim() 
        ? `${formData.note.trim()}\n${formData.details.trim()}`
        : formData.note.trim();

      const partyNote = [
        `Due Started: ${formData.date}`,
        finalNote, 
        formData.internalNote.trim() ? `Internal: ${formData.internalNote.trim()}` : ''
      ].filter(Boolean).join('\n');

      // Always create a new statement (party record) even for existing customers
      const { data: newCustomer, error: customerError } = await supabase
        .from('parties')
        .insert({
          name: finalCustomerName,
          party_type: 'customer',
          opening_balance: 0,
          current_balance: amount,
          note: partyNote || null,
          ...(customerPhone ? { phone: customerPhone } : {}),
          ...(customerAddress ? { address: customerAddress } : {})
        })
        .select()
        .single()

      if (customerError) throw customerError

      const { error: ledgerError } = await supabase
        .from('ledger_entries')
        .insert({
          party_id: newCustomer.id,
          entry_type: 'debit',
          amount: amount,
          related_type: 'adjustment',
          entry_date: formData.date,
          note: finalNote || 'Opening Balance'
        })

      if (ledgerError) throw ledgerError

      toast.success('Balance added successfully')
      router.push('/all-customers')
    } catch (error: any) {
      toast.error('Error adding balance: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">Add Balance</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Customer Name *
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
                    if (formData.customer_id) setFormData({ ...formData, customer_id: '' })
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
                <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 mr-1" /> New
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setFormData({ ...formData, customer_id: customer.id })
                        setSearchQuery(customer.name)
                        setIsNewCustomer(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-sm text-gray-500">Current Balance: ₹{customer.current_balance.toLocaleString('en-IN')}</div>
                    </button>
                  ))}
                {searchQuery.trim() && !customers.some(c => c.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setIsNewCustomer(true)
                      setCustomerName(searchQuery.trim())
                      setFormData({ ...formData, customer_id: 'new' })
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

        <div className="bg-white rounded-xl p-4 border space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Balance Due (₹) *</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">This amount will be added to the customer's due balance.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Date *</label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Particulars *</label>
            <input
              type="text"
              required
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none mb-4"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Manual Details (Optional)</label>
            <textarea
              rows={2}
              placeholder="E.g., payment for shirts or pants..."
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">This will be shown below the balance calculation in the statement.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Internal Note (Optional)</label>
            <textarea
              rows={2}
              placeholder="Private note for your reference..."
              value={formData.internalNote}
              onChange={(e) => setFormData({ ...formData, internalNote: e.target.value })}
              className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">This will only be visible to you and won't appear on the statement.</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={(!formData.customer_id && !isNewCustomer) || !formData.amount || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : 'Set Customer Balance'}
        </button>
      </form>
    </div>
  )
}