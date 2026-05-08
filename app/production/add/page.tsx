'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Factory, Package, Calendar, Search } from 'lucide-react'
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
  const [formData, setFormData] = useState({
    factory_id: '',
    cloth_issue_id: '',
    product_type: '',
    output_quantity: '',
    output_unit: 'pieces',
    rate_per_unit: '',
    paid_amount: '0',
    production_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchFactories()
  }, [])

  const fetchFactories = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name, current_balance')
      .eq('party_type', 'factory')
      .order('name')
    
    if (data) {
      setFactories(data)
      
      // Auto-select if URL params exist (e.g. coming from Factory Records page)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const fId = params.get('factoryId')
        const iId = params.get('issueId')
        
        if (fId) {
          const factory = data.find(f => f.id === fId)
          if (factory) {
            setSearchQuery(factory.name)
            fetchFactoryIssues(fId, iId)
          }
        }
      }
    }
  }

  const fetchFactoryIssues = async (factoryId: string, preselectIssueId?: string | null) => {
    setSelectedFactory(factoryId)
    setFormData(prev => ({ ...prev, factory_id: factoryId, cloth_issue_id: '' }))
    setSelectedIssue(null)

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
      .eq('factory_id', factoryId)
      .gt('meters_given', 0)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) {
      // Filter out issues that already have production records (fully utilized)
      const availableIssues = (data as ClothIssue[]).filter(i => !i.production_records || i.production_records.length === 0)
      setIssues(availableIssues)
      if (preselectIssueId) {
        const issue = availableIssues.find(i => i.id === preselectIssueId)
        if (issue) {
          setSelectedIssue(issue)
          setFormData(prev => ({
            ...prev,
            cloth_issue_id: preselectIssueId,
            product_type: issue.product_type || ''
          }))
        }
      }
    }
  }

  const handleIssueSelect = (issueId: string) => {
    const issue = issues.find(i => i.id === issueId)
    setSelectedIssue(issue || null)
    setFormData(prev => ({
      ...prev,
      cloth_issue_id: issueId,
      product_type: issue?.product_type || ''
    }))
  }

  const quantity = parseInt(formData.output_quantity) || 0
  const rate = parseFloat(formData.rate_per_unit) || 0
  const totalValue = quantity * rate
  const dueAmount = totalValue - (parseFloat(formData.paid_amount) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.cloth_issue_id) {
      toast.error('Please select a cloth issue')
      return
    }

    if (quantity <= 0) {
      toast.error('Please enter valid quantity')
      return
    }

    setIsSubmitting(true)

    const productionData = {
      factory_id: formData.factory_id,
      cloth_issue_id: formData.cloth_issue_id,
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

    // Add ledger entry for factory (credit = they produced goods, debit = we owe them)
    await supabase
      .from('ledger_entries')
      .insert({
        party_id: formData.factory_id,
        entry_type: 'credit',
        amount: totalValue,
        related_type: 'production',
        related_id: production.id,
        entry_date: formData.production_date,
        note: `Production: ${quantity} ${formData.product_type}`
      })

    // Update factory balance
    const factory = factories.find(f => f.id === formData.factory_id)
    const newBalance = (factory?.current_balance || 0) + dueAmount

    const { error: updateError } = await supabase
      .from('parties')
      .update({ current_balance: newBalance })
      .eq('id', formData.factory_id)

    if (updateError) {
      console.error('Failed to update factory balance:', updateError)
    }

    // If payment made, record it
    if (parseFloat(formData.paid_amount) > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
          party_id: formData.factory_id,
          related_type: 'production',
          related_id: production.id,
          amount: parseFloat(formData.paid_amount),
          payment_date: formData.production_date,
          payment_mode: 'cash',
          note: `Payment for production: ${formData.product_type}`
        })
        .select()
        .single()

      if (!payError && payment) {
        // Add payment ledger entry
        await supabase
          .from('ledger_entries')
          .insert({
            party_id: formData.factory_id,
            entry_type: 'debit',
            amount: parseFloat(formData.paid_amount),
            related_type: 'payment',
            related_id: payment.id,
            entry_date: formData.production_date,
            note: `Payment made for production`
          })
      }
    }

    toast.success('Production recorded successfully')
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
                    if (formData.factory_id) setFormData({ ...formData, factory_id: '' })
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.factory_id && (
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
                      key={factory.id}
                      onClick={() => {
                        fetchFactoryIssues(factory.id)
                        setSearchQuery(factory.name)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      {factory.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Select Cloth Issue */}
        {selectedFactory && (
          <div className="bg-white rounded-xl p-4 border">
            <label className="block text-sm font-medium mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Cloth Issued to Factory *
            </label>
            
            {issues.length === 0 ? (
              <p className="text-center py-4 text-gray-500">
                No cloth issues found for this factory
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {issues.map(issue => (
                  <div
                    key={issue.id}
                    onClick={() => handleIssueSelect(issue.id)}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Production Details */}
        {selectedIssue && (
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
            {totalValue > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Production Value</span>
                  <span className="text-lg font-bold">₹{totalValue.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Amount Paid Now (₹)</label>
              <input
                type="number"
                min="0"
                max={totalValue}
                step="0.01"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
              {totalValue > 0 && (
                <p className="text-sm text-orange-600 mt-1">
                  Due after payment: ₹{dueAmount.toLocaleString('en-IN')}
                </p>
              )}
            </div>

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
          disabled={!selectedIssue || isSubmitting}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Adding...' : 'Add Garments to Stock'}
        </button>
      </form>
    </div>
  )
}