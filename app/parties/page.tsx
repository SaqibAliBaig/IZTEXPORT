'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase' 
import { Plus, Search, Edit2, Save, X, Users, DollarSign, Truck, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Party {
  id: string
  name: string
  party_type: 'customer' | 'factory' | 'supplier'
  phone: string
  address: string
  opening_balance: number
  current_balance: number
}

export default function PartiesPage() {
  const [parties, setParties] = useState<Party[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null)
  const [editingBalance, setEditingBalance] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'customer' | 'factory' | 'supplier'>('all')
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [deletingParty, setDeletingParty] = useState<Party | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    party_type: 'customer',
    phone: '',
    address: '',
    opening_balance: '0'
  })

  useEffect(() => {
    fetchParties()
  }, [])

  const fetchParties = async () => {
    const { data, error } = await supabase
      .from('parties')
      .select('*')
      .order('name')

    if (data) setParties(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfirmingAdd(true)
  }

  const executeAdd = async () => {
    const { error } = await supabase
      .from('parties')
      .insert({
        name: formData.name,
        party_type: formData.party_type,
        phone: formData.phone,
        address: formData.address,
        opening_balance: parseFloat(formData.opening_balance) || 0,
        current_balance: parseFloat(formData.opening_balance) || 0
      })

    if (error) {
      toast.error('Failed to add party')
      return
    }

    toast.success('Party added successfully')
    setShowForm(false)
    setConfirmingAdd(false)
    setFormData({ name: '', party_type: 'customer', phone: '', address: '', opening_balance: '0' })
    fetchParties()
  }

  const handleEditClick = (party: Party) => {
    setEditingPartyId(party.id)
    setEditingBalance(String(party.current_balance))
  }

  const handleCancelEdit = () => {
    setEditingPartyId(null)
    setEditingBalance('')
  }

  const handleSaveEdit = async (partyId: string) => {
    const newBalance = parseFloat(editingBalance)
    if (isNaN(newBalance)) {
      toast.error('Please enter a valid number for the balance.')
      return
    }

    const { error } = await supabase
      .from('parties')
      .update({ current_balance: newBalance })
      .eq('id', partyId)

    if (error) {
      toast.error('Failed to update balance.')
    } else {
      toast.success('Balance updated successfully.')
      fetchParties() // Re-fetch to get the latest data
      handleCancelEdit()
    }
  }

  const executeDelete = async () => {
    if (!deletingParty) return
    
    setIsDeleting(true)
    const { error } = await supabase
      .from('parties')
      .delete()
      .eq('id', deletingParty.id)

    setIsDeleting(false)
    if (error) {
      toast.error('Failed to delete party. Ensure they have no associated transactions.')
    } else {
      toast.success('Party deleted successfully')
      setDeletingParty(null)
      fetchParties()
    }
  }

  const filteredParties = parties.filter(party => {
    const matchesSearch = party.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || party.party_type === filterType
    return matchesSearch && matchesType
  })

  const customerDues = parties.filter(p => p.party_type === 'customer').reduce((sum, p) => sum + p.current_balance, 0)
  const factoryDues = parties.filter(p => p.party_type === 'factory').reduce((sum, p) => sum + p.current_balance, 0)
  const supplierDues = parties.filter(p => p.party_type === 'supplier').reduce((sum, p) => sum + p.current_balance, 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Parties</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Party
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Customer Dues</p>
            <p className={`text-2xl font-bold ${customerDues > 0 ? 'text-green-500' : customerDues < 0 ? 'text-red-500' : 'text-gray-900'}`}>
              ₹{customerDues.toLocaleString('en-IN')}
            </p>
          </div>
          <Users className="w-8 h-8 text-orange-500" />
        </div>
        
        <div className="bg-white rounded-xl p-4 border flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Factory Dues</p>
            <p className={`text-2xl font-bold ${factoryDues > 0 ? 'text-green-500' : factoryDues < 0 ? 'text-red-500' : 'text-gray-900'}`}>
              ₹{factoryDues.toLocaleString('en-IN')}
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-purple-500" />
        </div>

        <div className="bg-white rounded-xl p-4 border flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Supplier Dues</p>
            <p className={`text-2xl font-bold ${supplierDues > 0 ? 'text-green-500' : supplierDues < 0 ? 'text-red-500' : 'text-gray-900'}`}>
              ₹{supplierDues.toLocaleString('en-IN')}
            </p>
          </div>
          <Truck className="w-8 h-8 text-pink-500" />
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex bg-white rounded-xl border p-1 overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterType === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('customer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterType === 'customer' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Customers
          </button>
          <button
            onClick={() => setFilterType('factory')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterType === 'factory' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Factories
          </button>
          <button
            onClick={() => setFilterType('supplier')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterType === 'supplier' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Suppliers
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search parties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      {/* Party List */}
      <div className="grid gap-4">
        {filteredParties.map(party => (
          <div key={party.id} className="bg-white rounded-xl p-4 border">
            <div className="flex justify-between items-start">
              <div>
                <Link href={`/statements/${party.id}`} className="font-semibold text-lg hover:text-blue-600 hover:underline" title="View Account Statement">
                  {party.name}
                </Link>
                <span className="text-sm px-2 py-1 bg-gray-100 rounded-full">
                  {party.party_type}
                </span>
                {party.phone && <p className="text-sm text-gray-600 mt-1"> {party.phone}</p>}
              </div>
              {editingPartyId === party.id ? (
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${Number(editingBalance) > 0 ? 'text-green-500' : Number(editingBalance) < 0 ? 'text-red-500' : 'text-gray-500'}`}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editingBalance}
                    onChange={(e) => setEditingBalance(e.target.value)}
                    className={`w-32 px-3 py-2 border rounded-lg text-right focus:ring-2 focus:ring-black outline-none font-semibold ${Number(editingBalance) > 0 ? 'text-green-600' : Number(editingBalance) < 0 ? 'text-red-600' : 'text-gray-900'}`}
                    autoFocus
                  />
                  <button onClick={() => handleSaveEdit(party.id)} className="p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                    <Save className="w-4 h-4" />
                  </button>
                  <button onClick={handleCancelEdit} className="p-2 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-right flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Balance</p>
                    <p className={`text-lg font-bold ${party.current_balance > 0 ? 'text-green-600' : party.current_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ₹{party.current_balance.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <button onClick={() => handleEditClick(party)} className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-full" title="Edit Balance">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeletingParty(party)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full" title="Delete Party">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Party Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            {confirmingAdd ? (
              <div className="text-center py-4">
                <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Confirm New Party</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to add <strong>{formData.name}</strong> as a new {formData.party_type}?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmingAdd(false)}
                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Back to Edit
                  </button>
                  <button
                    onClick={executeAdd}
                    className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                  >
                    Confirm Add
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-4">Add New Party</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Type *</label>
                    <select
                      value={formData.party_type}
                      onChange={(e) => setFormData({ ...formData, party_type: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="customer">Customer</option>
                      <option value="factory">Factory</option>
                      <option value="supplier">Supplier</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Opening Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.opening_balance}
                      onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false)
                        setConfirmingAdd(false)
                      }}
                      className="flex-1 px-4 py-2 border rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                      Continue
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingParty && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Delete Party</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deletingParty.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingParty(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}