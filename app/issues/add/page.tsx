'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, Factory, Search, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Factory {
  id: string
  name: string
}

interface ClothStock {
  id: string
  purchase_id: string
  cloth_name: string
  cloth_color: string
  meters_remaining: number
  meters_issued: number
  purchase: {
    color_image_url: string
  }
}

export default function IssueClothPage() {
  const router = useRouter()
  const [factories, setFactories] = useState<Factory[]>([])
  const [stocks, setStocks] = useState<ClothStock[]>([])
  const [selectedStock, setSelectedStock] = useState<ClothStock | null>(null)
  const [isNewFactory, setIsNewFactory] = useState(false)
  const [newFactoryName, setNewFactoryName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [formData, setFormData] = useState({
    factory_id: '',
    stock_id: '',
    meters_given: '',
    product_type: '',
    issue_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    fetchFactories()
    fetchAvailableStock()
  }, [])

  const fetchFactories = async () => {
    const { data } = await supabase
      .from('parties')
      .select('id, name')
      .eq('party_type', 'factory')
      .order('name')
    if (data) setFactories(data)
  }

  const fetchAvailableStock = async () => {
    const { data } = await supabase
      .from('cloth_stock')
      .select(`
        *,
        purchase:cloth_purchases!cloth_stock_purchase_id_fkey(color_image_url)
      `)
      .gt('meters_remaining', 0)
      .order('cloth_name')
    if (data) setStocks(data)
  }

  const handleStockSelect = (stockId: string) => {
    const stock = stocks.find(s => s.id === stockId)
    setSelectedStock(stock || null)
    setFormData(prev => ({ ...prev, stock_id: stockId, meters_given: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedStock) {
      toast.error('Please select cloth stock')
      return
    }

    let finalFactoryId = formData.factory_id

    if (isNewFactory) {
      if (!newFactoryName.trim()) {
        toast.error('Please enter a factory name')
        return
      }
      const { data: newParty, error: partyError } = await supabase
        .from('parties')
        .insert({
          name: newFactoryName.trim(),
          party_type: 'factory',
          current_balance: 0,
          opening_balance: 0
        })
        .select()
        .single()

      if (partyError) {
        toast.error('Failed to create new factory')
        return
      }
      finalFactoryId = newParty.id
    } else if (!finalFactoryId) {
      toast.error('Please select a factory')
      return
    }

    const metersToIssue = parseFloat(formData.meters_given)
    
    if (metersToIssue <= 0) {
      toast.error('Please enter valid meters')
      return
    }

    if (metersToIssue > selectedStock.meters_remaining) {
      toast.error(`Cannot issue more than available stock (${selectedStock.meters_remaining}m)`)
      return
    }

    // Create cloth issue record
    const { data: issue, error: issueError } = await supabase
      .from('cloth_issues')
      .insert({
        factory_id: finalFactoryId,
        cloth_purchase_id: selectedStock.purchase_id,
        meters_given: metersToIssue,
        product_type: formData.product_type,
        issue_date: formData.issue_date,
        note: formData.note
      })
      .select()
      .single()

    if (issueError) {
      toast.error('Failed to issue cloth')
      return
    }

    // Update stock
    const { error: stockError } = await supabase
      .from('cloth_stock')
      .update({ 
        meters_issued: selectedStock.meters_issued + metersToIssue
      })
      .eq('id', selectedStock.id)

    if (stockError) {
      toast.error('Stock update failed')
      return
    }

    toast.success('Cloth issued successfully')
    router.push('/issues')
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
        <h2 className="text-2xl font-bold">Issue Cloth to Factory</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Factory Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Factory className="w-4 h-4" />
            Factory *
          </label>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search or enter new factory..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowDropdown(true)
                    if (formData.factory_id) setFormData({ ...formData, factory_id: '' })
                    if (isNewFactory) setIsNewFactory(false)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              {formData.factory_id && !isNewFactory && (
                <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                  ✓ Selected
                </span>
              )}
              {isNewFactory && (
                <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer flex items-center justify-center hover:bg-blue-200 transition-colors">
                  <ArrowRight className="w-4 h-4" />
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
                        setFormData({ ...formData, factory_id: factory.id })
                        setSearchQuery(factory.name)
                        setIsNewFactory(false)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0"
                    >
                      {factory.name}
                    </button>
                  ))}
                {searchQuery.trim() && !factories.some(f => f.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewFactory(true)
                      setNewFactoryName(searchQuery.trim())
                      setFormData({ ...formData, factory_id: 'new' })
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                  >
                    + Add "{searchQuery.trim()}" as new factory
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stock Selection */}
        <div className="bg-white rounded-xl p-4 border">
          <label className="block text-sm font-medium mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Available Cloth Stock *
          </label>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {stocks.map(stock => (
              <div
                key={stock.id}
                onClick={() => handleStockSelect(stock.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedStock?.id === stock.id
                    ? 'border-black bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {stock.purchase?.color_image_url ? (
                  <img
                    src={stock.purchase.color_image_url}
                    alt={stock.cloth_color}
                    className="w-12 h-12 object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">{stock.cloth_name}</p>
                  {stock.cloth_color && (
                    <p className="text-sm text-gray-600">{stock.cloth_color}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">
                    {stock.meters_remaining}m
                  </p>
                  <p className="text-xs text-gray-500">available</p>
                </div>
              </div>
            ))}

            {stocks.length === 0 && (
              <p className="text-center py-4 text-gray-500">
                No stock available. Add purchase first.
              </p>
            )}
          </div>
        </div>

        {/* Issue Details */}
        {selectedStock && (
          <div className="bg-white rounded-xl p-4 border space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Meters to Issue *</label>
              <input
                type="number"
                required
                min="0.01"
                max={selectedStock.meters_remaining}
                step="0.01"
                placeholder="Enter meters"
                value={formData.meters_given}
                onChange={(e) => setFormData({ ...formData, meters_given: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
              <p className="text-sm text-gray-500 mt-1">
                Maximum available: {selectedStock.meters_remaining}m
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Product Type (What they'll make)
              </label>
              <input
                type="text"
                placeholder="e.g., Shirts, Pants, Suits"
                value={formData.product_type}
                onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Issue Date *</label>
              <input
                type="date"
                required
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Additional instructions..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-3 py-3 border rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!selectedStock}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Issue Cloth to Factory
        </button>
      </form>
    </div>
  )
}