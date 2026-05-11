'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Printer, X, Plus, Search, ArrowRight, Download, Package, Factory, Calendar, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'

interface Party {
  id: string
  name: string
  party_type: string
  phone: string
  address: string
  opening_balance: number
  current_balance: number
  created_at: string
}

interface LedgerEntry {
  id: string
  entry_date: string
  entry_type: 'credit' | 'debit'
  amount: number
  note: string
  related_type: string
  related_id?: string
  created_at: string
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
  is_active?: boolean
}
interface ClothStock {
  id: string
  purchase_id: string
  cloth_name: string
  cloth_color: string
  meters_remaining: number
  meters_issued: number
  purchase: { color_image_url: string }
}

export default function PartyStatementPage() {
  const router = useRouter()
  const params = useParams()
  const partyId = params?.partyId as string
  
  const [party, setParty] = useState<Party | null>(null)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateType, setUpdateType] = useState<'receive' | 'give'>('receive')
  const [updateAmount, setUpdateAmount] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split('T')[0])
  const [isUpdating, setIsUpdating] = useState(false)

  const [isAddProductionModalOpen, setIsAddProductionModalOpen] = useState(false)
  const [clothIssues, setClothIssues] = useState<ClothIssue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<ClothIssue | null>(null)
  const [clothStocks, setClothStocks] = useState<ClothStock[]>([])
  const [selectedStock, setSelectedStock] = useState<ClothStock | null>(null)
  const [metersToIssue, setMetersToIssue] = useState('')
  const [productionFormData, setProductionFormData] = useState({
    cloth_issue_id: '',
    product_type: '',
    output_quantity: '',
    output_unit: 'pieces',
    rate_per_unit: '',
    paid_amount: '0',
    production_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  const [isAddSaleModalOpen, setIsAddSaleModalOpen] = useState(false)
  const [productStocks, setProductStocks] = useState<{ product_type: string, quantity: number }[]>([])
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [isNewProduct, setIsNewProduct] = useState(false)
  const [productsLoading, setProductsLoading] = useState(false)
  
  const [saleFormData, setSaleFormData] = useState({
    product_type: '',
    quantity: '',
    rate: '',
    paid_amount: '0',
    sale_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null)
  const [editEntryFormData, setEditEntryFormData] = useState({
    amount: '',
    note: '',
    entry_date: ''
  })
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntry | null>(null)

  useEffect(() => {
    if (partyId) {
      fetchStatement()
    }
  }, [partyId])


  useEffect(() => {
    if (saleFormData.product_type) {
      const isNew = !productStocks.some(p => p.product_type === saleFormData.product_type)
      setIsNewProduct(isNew)
    }
  }, [saleFormData.product_type, productStocks])

  const fetchStatement = async () => {
    setLoading(true)
    
    // Fetch party details
    const { data: partyData, error: partyError } = await supabase
      .from('parties')
      .select('*')
      .eq('id', partyId)
      .single()

    if (partyError || !partyData) {
      toast.error('Failed to load party details')
      router.push('/statements')
      return
    }
    
    setParty(partyData)

    // Fetch ledger entries
    const { data: ledgerData, error: ledgerError } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('party_id', partyId)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (ledgerData) {
      // Filter out duplicate opening balance ledger entry if it was created by the add-balance bug
      const cleanedData = ledgerData.filter((entry, index) => {
        if (
          index === 0 && 
          entry.related_type === 'adjustment' && 
          entry.amount === partyData.opening_balance
        ) {
           const timeDiff = Math.abs(new Date(entry.created_at).getTime() - new Date(partyData.created_at).getTime());
           if (timeDiff < 5000) return false;
        }
        return true;
      });
      setEntries(cleanedData)
    }
    
    setLoading(false)
  }

  const fetchProductStock = async () => {
    setProductsLoading(true)
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
    })).sort((a, b) => a.product_type.localeCompare(b.product_type));

    setProductStocks(pStocks)
    setProductsLoading(false)
  }

  const openAddSaleModal = () => {
    fetchProductStock()
    setIsAddSaleModalOpen(true)
  }

  const openAddProductionModal = () => {
    if (!party) return
    // Reset state for the modal to ensure clean state on each open
    setSelectedIssue(null)
    setSelectedStock(null)
    setMetersToIssue('')
    setProductionFormData({
      cloth_issue_id: '',
      product_type: '',
      output_quantity: '',
      output_unit: 'pieces',
      rate_per_unit: '',
      paid_amount: '0',
      production_date: new Date().toISOString().split('T')[0],
      note: ''
    })
    setClothIssues([]) // Clear previous issues
    setClothStocks([]) // Clear previous stocks
    fetchFactoryIssues()
    setIsAddProductionModalOpen(true)
  }

  const fetchFactoryIssues = async () => {
    if (!party) return
    setIssuesLoading(true)

    const { data: matchingParties } = await supabase
      .from('parties')
      .select('id')
      .eq('name', party.name)
      .eq('party_type', 'factory')

    const partyIds = matchingParties?.map(p => p.id) || []
    let availableIssues: ClothIssue[] = []

    if (partyIds.length > 0) {
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
        .in('factory_id', partyIds)
        .gt('meters_given', 0)
        .order('issue_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (data) {
        // Filter out soft-deleted issues
        availableIssues = (data as ClothIssue[]).filter(i => i.is_active !== false)
        setClothIssues(availableIssues)
      } else {
        setClothIssues([])
      }
    } else {
      setClothIssues([])
    }

    const { data: stockData } = await supabase
      .from('cloth_stock')
      .select(`
        *,
        purchase:cloth_purchases!cloth_stock_purchase_id_fkey(color_image_url)
      `)
      .gt('meters_remaining', 0)
      .order('cloth_name')
      
    if (stockData) {
      setClothStocks(stockData)
    } else {
      setClothStocks([])
    }

    if (availableIssues.length > 0) {
      handleIssueSelect(availableIssues[0], null)
    } else if (stockData && stockData.length > 0) {
      handleIssueSelect(null, stockData[0])
    }

    setIssuesLoading(false)
  }

  const handleIssueSelect = (issue: ClothIssue | null, stock: ClothStock | null = null) => {
    setSelectedIssue(issue)
    setSelectedStock(stock)
    setMetersToIssue('')
    setProductionFormData(prev => ({
      ...prev,
      cloth_issue_id: issue ? issue.id : '',
      product_type: issue?.product_type || ''
    }))
  }

  const handleRemoveIssue = async (issueId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    toast((t) => (
      <div>
        <p className="mb-4 text-sm font-medium text-gray-800">Are you sure you want to remove this issued cloth from the active list? (It will remain in the database)</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id)
              setIsUpdating(true)
              try {
                const { error } = await supabase
                  .from('cloth_issues')
                  .update({ is_active: false })
                  .eq('id', issueId)

                if (error) {
                  if (error.message.includes('is_active')) {
                    toast.error('Please run the SQL command to add is_active column first.')
                  } else throw error
                  return
                }
                toast.success('Removed successfully')
                fetchFactoryIssues()
              } catch (error: any) {
                toast.error('Failed to remove: ' + error.message)
              } finally {
                setIsUpdating(false)
              }
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    ), { duration: Infinity })
  }

  const handleAddProduction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!party || (!selectedIssue && !selectedStock)) {
      toast.error('Please select an issued cloth or available stock.')
      return
    }

    const quantity = parseInt(productionFormData.output_quantity) || 0
    const rate = parseFloat(productionFormData.rate_per_unit) || 0
    const paidNow = parseFloat(productionFormData.paid_amount) || 0

    if (quantity <= 0 || rate < 0) {
      toast.error('Please enter valid quantity and rate.')
      return
    }

    let currentIssueId = selectedIssue?.id

    if (selectedStock) {
      const issueMeters = parseFloat(metersToIssue)
      if (isNaN(issueMeters) || issueMeters <= 0 || issueMeters > selectedStock.meters_remaining) {
         toast.error('Please enter a valid number of meters to issue.')
         return
      }

      setIsUpdating(true)

      const { data: newIssue, error: issueError } = await supabase
        .from('cloth_issues')
        .insert({
          factory_id: party.id,
          cloth_purchase_id: selectedStock.purchase_id,
          meters_given: issueMeters,
          product_type: productionFormData.product_type,
          issue_date: productionFormData.production_date,
          note: 'Issued directly from production form'
        })
        .select()
        .single()

      if (issueError) {
        toast.error('Failed to issue cloth')
        setIsUpdating(false)
        return
      }

      currentIssueId = newIssue.id

      await supabase
        .from('cloth_stock')
        .update({ 
          meters_issued: selectedStock.meters_issued + issueMeters
        })
        .eq('id', selectedStock.id)
    } else {
      setIsUpdating(true)
    }

    const totalValue = quantity * rate
    const dueAmount = totalValue - paidNow

    try {
      const productionData = {
        factory_id: party.id,
        cloth_issue_id: currentIssueId,
        product_type: productionFormData.product_type,
        output_quantity: quantity,
        output_unit: productionFormData.output_unit,
        rate_per_unit: rate,
        total_value: totalValue,
        paid_amount: paidNow,
        production_date: productionFormData.production_date,
        note: productionFormData.note
      }

      const { data: production, error: prodError } = await supabase.from('production_records').insert(productionData).select().single()
      if (prodError) throw prodError

      await supabase.from('ledger_entries').insert({
        party_id: party.id, entry_type: 'credit', amount: totalValue, related_type: 'production',
        related_id: production.id, entry_date: productionFormData.production_date, note: `Production: ${quantity} ${productionFormData.product_type} x ₹${rate}/${productionFormData.output_unit === 'pieces' ? 'piece' : productionFormData.output_unit.replace(/s$/, '')}`
      })

      if (paidNow > 0) {
        const { data: payment, error: payError } = await supabase.from('payments').insert({
          party_id: party.id, related_type: 'production', related_id: production.id, amount: paidNow,
          payment_date: productionFormData.production_date, payment_mode: 'cash', note: `Payment for production: ${productionFormData.product_type}`
        }).select().single()

        if (!payError && payment) {
          await supabase.from('ledger_entries').insert({
            party_id: party.id, entry_type: 'debit', amount: paidNow, related_type: 'payment',
            related_id: payment.id, entry_date: productionFormData.production_date, note: `Payment for production: ${productionFormData.product_type}`
          })
        }
      }

      const newBalance = party.current_balance + dueAmount
      await supabase.from('parties').update({ current_balance: newBalance }).eq('id', party.id)
        
      toast.success('Production added successfully')
      setIsAddProductionModalOpen(false)
      setProductionFormData({ cloth_issue_id: '', product_type: '', output_quantity: '', output_unit: 'pieces', rate_per_unit: '', paid_amount: '0', production_date: new Date().toISOString().split('T')[0], note: '' })
      setSelectedIssue(null)
      fetchStatement()
    } catch (error: any) {
      toast.error('Failed to add production: ' + error.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!party) return
    const quantity = parseInt(saleFormData.quantity) || 0
    const rate = parseFloat(saleFormData.rate) || 0
    const paidNow = parseFloat(saleFormData.paid_amount) || 0

    if (quantity <= 0 || rate <= 0) {
      toast.error('Please enter valid quantity and rate')
      return
    }

    const availableStock = productStocks.find(p => p.product_type === saleFormData.product_type)?.quantity || 0
    if (!isNewProduct && quantity > availableStock) {
      toast.error(`Cannot sell more than available stock (${availableStock})`)
      return;
    }

    setIsUpdating(true)
    const totalAmount = quantity * rate
    
    try {
      const saleData = {
        customer_id: party.id,
        product_type: saleFormData.product_type,
        quantity: quantity,
        rate: rate,
        total_amount: totalAmount,
        old_balance: party.current_balance, // previous balance
        paid_amount: paidNow,
        sale_date: saleFormData.sale_date,
        note: saleFormData.note
      }

      // Insert sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single()

      if (saleError) throw saleError

      // Add ledger entry for customer (debit = customer owes us)
      const { data: debitEntry, error: debitError } = await supabase
        .from('ledger_entries')
        .insert({
          party_id: party.id,
          entry_type: 'debit',
          amount: totalAmount,
          related_type: 'sale',
          related_id: sale.id,
          entry_date: saleFormData.sale_date,
          note: `Sale: ${quantity} ${saleFormData.product_type} x ₹${rate}/piece${saleFormData.note ? ` - ${saleFormData.note}` : ''}`
        })
        .select()
        .single()

      let newBalance = party.current_balance + totalAmount

      const newEntries = debitEntry ? [debitEntry] : []

      // If payment made, record it
      if (paidNow > 0) {
        const { data: payment, error: payError } = await supabase
          .from('payments')
          .insert({
            party_id: party.id,
            related_type: 'sale',
            related_id: sale.id,
            amount: paidNow,
            payment_date: saleFormData.sale_date,
            payment_mode: 'cash',
            note: `Payment for sale: ${saleFormData.product_type}`
          })
          .select()
          .single()

        if (!payError && payment) {
          // Add payment ledger entry
          const { data: creditEntry } = await supabase
            .from('ledger_entries')
            .insert({
              party_id: party.id,
              entry_type: 'credit',
              amount: paidNow,
              related_type: 'payment',
              related_id: payment.id,
              entry_date: saleFormData.sale_date,
              note: `Payment received for sale: ${saleFormData.product_type}`
            })
            .select()
            .single()
            
          newBalance -= paidNow
          if (creditEntry) newEntries.push(creditEntry)
        }
      }

      const { error: partyUpdateError } = await supabase
        .from('parties')
        .update({ current_balance: newBalance })
        .eq('id', party.id)
        
      if (partyUpdateError) throw partyUpdateError

      setParty(prev => prev ? { ...prev, current_balance: newBalance } : null)
      setEntries(prev => {
        const combined = [...prev, ...newEntries]
        return combined.sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime() || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
      
      toast.success('Sale added successfully')
      setIsAddSaleModalOpen(false)
      setSaleFormData({
        product_type: '',
        quantity: '',
        rate: '',
        paid_amount: '0',
        sale_date: new Date().toISOString().split('T')[0],
        note: ''
      })
    } catch (error: any) {
      toast.error('Failed to add sale: ' + error.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleUpdateBalance = async () => {
    if (!party) return

    if (!updateAmount || isNaN(Number(updateAmount)) || Number(updateAmount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    const amount = Number(updateAmount)

    setIsUpdating(true)
    try {
      // Receive Money = Credit, Give Money = Debit
      const entryType = updateType === 'receive' ? 'credit' : 'debit'
      
      const { data: newEntry, error: ledgerError } = await supabase
        .from('ledger_entries')
        .insert({
          party_id: party.id,
          entry_date: updateDate,
          entry_type: entryType,
          amount: amount,
          note: updateNote || (updateType === 'receive' ? 'Payment Received' : 'Payment Given'),
          related_type: 'payment'
        })
        .select()
        .single()
      if (ledgerError) throw ledgerError

      // Manually calculate and update the party's current balance
      let newBalance = party.current_balance
      const isCustomer = party.party_type === 'customer'
      if (isCustomer) {
        if (entryType === 'debit') newBalance += amount
        else newBalance -= amount
      } else {
        if (entryType === 'credit') newBalance += amount
        else newBalance -= amount
      }

      const { error: partyUpdateError } = await supabase
        .from('parties')
        .update({ current_balance: newBalance })
        .eq('id', party.id)
        
      if (partyUpdateError) console.error('Failed to update party balance directly', partyUpdateError)

      // Immediately update local state for transparent reflection
      setParty(prev => prev ? { ...prev, current_balance: newBalance } : null)

      if (newEntry) {
        setEntries(prev => [...prev, newEntry])
      }
      
      toast.success('Balance updated successfully')
      setIsUpdateModalOpen(false)
      setUpdateAmount('')
      setUpdateNote('')
      fetchStatement() // background refresh to ensure sync
    } catch (error: any) {
      toast.error('Failed to update balance: ' + error.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEditEntryClick = (entry: LedgerEntry) => {
    if (entry.id === 'manual-adjustment') return;
    
    setEditingEntry(entry)
    setEditEntryFormData({
      amount: entry.amount.toString(),
      note: entry.note || '',
      entry_date: entry.entry_date || new Date().toISOString().split('T')[0]
    })
  }

  const handleSaveEntryEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEntry || !party) return

    const newAmount = parseFloat(editEntryFormData.amount)
    if (isNaN(newAmount) || newAmount < 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsUpdating(true)
    try {
      const amountDiff = newAmount - editingEntry.amount
      
      const { error: ledgerError } = await supabase
        .from('ledger_entries')
        .update({
          amount: newAmount,
          note: editEntryFormData.note,
          entry_date: editEntryFormData.entry_date
        })
        .eq('id', editingEntry.id)

      if (ledgerError) throw ledgerError

      if (amountDiff !== 0) {
        let newBalance = party.current_balance
        const isCustomer = party.party_type === 'customer'
        if (isCustomer) {
          if (editingEntry.entry_type === 'debit') newBalance += amountDiff
          else newBalance -= amountDiff
        } else {
          if (editingEntry.entry_type === 'credit') newBalance += amountDiff
          else newBalance -= amountDiff
        }

        const { error: partyError } = await supabase
          .from('parties')
          .update({ current_balance: newBalance })
          .eq('id', party.id)

        if (partyError) throw partyError
        
        // Update related records
        if (editingEntry.related_id) {
          if (editingEntry.related_type === 'payment') {
             await supabase.from('payments').update({ amount: newAmount }).eq('id', editingEntry.related_id)
          } else if (editingEntry.related_type === 'sale') {
             await supabase.from('sales').update({ total_amount: newAmount }).eq('id', editingEntry.related_id)
          } else if (editingEntry.related_type === 'production') {
             await supabase.from('production_records').update({ total_value: newAmount }).eq('id', editingEntry.related_id)
          }
        }
      }

      toast.success('Entry updated successfully')
      setEditingEntry(null)
      fetchStatement()
    } catch (error: any) {
      toast.error('Failed to update entry: ' + error.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleConfirmDeleteEntry = async () => {
    if (!deletingEntry || !party) return;
    setIsUpdating(true)
    try {
      // Delete the ledger entry
      const { error: ledgerError } = await supabase
        .from('ledger_entries')
        .delete()
        .eq('id', deletingEntry.id)

      if (ledgerError) throw ledgerError

      // Revert party balance
      let newBalance = party.current_balance
      const isCustomer = party.party_type === 'customer'
      if (isCustomer) {
        if (deletingEntry.entry_type === 'debit') newBalance -= deletingEntry.amount
        else newBalance += deletingEntry.amount
      } else {
        if (deletingEntry.entry_type === 'credit') newBalance -= deletingEntry.amount
        else newBalance += deletingEntry.amount
      }

      const { error: partyError } = await supabase
        .from('parties')
        .update({ current_balance: newBalance })
        .eq('id', party.id)

      if (partyError) throw partyError

      // Optionally delete related records
      if (deletingEntry.related_id) {
        if (deletingEntry.related_type === 'payment') {
           await supabase.from('payments').delete().eq('id', deletingEntry.related_id)
        } else if (deletingEntry.related_type === 'sale') {
           await supabase.from('sales').delete().eq('id', deletingEntry.related_id)
        } else if (deletingEntry.related_type === 'production') {
           await supabase.from('production_records').delete().eq('id', deletingEntry.related_id)
        }
      }

      toast.success('Entry deleted successfully')
      setDeletingEntry(null)
      fetchStatement()
    } catch (error: any) {
      toast.error('Failed to delete entry: ' + error.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDownloadPDF = async () => {
    const element = document.getElementById('statement-content')
    if (!element || !party) return

    const toastId = toast.loading('Generating PDF...')
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1024,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('statement-content')
          if (clonedElement) {
            // Force desktop-like dimensions for the PDF regardless of current screen size
            clonedElement.style.width = '900px'
            clonedElement.style.padding = '40px'
            
            // Fix overflow on mobile so table doesn't get clipped
            const tableWrappers = clonedElement.querySelectorAll('.overflow-x-auto')
            tableWrappers.forEach(wrapper => {
              const htmlWrapper = wrapper as HTMLElement
              htmlWrapper.style.overflow = 'visible'
              htmlWrapper.style.overflowX = 'visible'
              htmlWrapper.classList.remove('-mx-4', 'px-4') // Remove mobile margin/padding tweaks
            })
          }
        }
      })

      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      pdf.save(`${party.name.replace(/\s+/g, '_')}_Statement.pdf`)
      toast.success('PDF downloaded successfully', { id: toastId })
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF', { id: toastId })
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading statement...</div>
  }

  if (!party) return null

  // Calculate running balance
  let runningBalance = party.opening_balance || 0
  const statementRows = entries.map(entry => {
    const isCustomer = party.party_type === 'customer'
    const oldBalance = runningBalance
    
    if (isCustomer) {
      if (entry.entry_type === 'debit') runningBalance += entry.amount
      else runningBalance -= entry.amount
    } else {
      if (entry.entry_type === 'credit') runningBalance += entry.amount
      else runningBalance -= entry.amount
    }
    
    return {
      ...entry,
      oldBalance,
      balance: runningBalance
    }
  })

  // Check for discrepancy between running balance and current balance due to manual edits
  const discrepancy = party.current_balance - runningBalance
  if (Math.abs(discrepancy) > 0.001) {
    const isCustomer = party.party_type === 'customer'
    let entryType: 'debit' | 'credit' = 'debit'
    
    if (isCustomer) {
      entryType = discrepancy > 0 ? 'debit' : 'credit'
    } else {
      entryType = discrepancy > 0 ? 'credit' : 'debit'
    }

    statementRows.push({
      id: 'manual-adjustment',
      entry_date: new Date().toISOString().split('T')[0],
      entry_type: entryType,
      amount: Math.abs(discrepancy),
      note: 'Manual balance override from dashboard',
      related_type: 'adjustment',
      created_at: new Date().toISOString(),
      oldBalance: runningBalance,
      balance: party.current_balance
    })
  }

  // Show oldest entries first (chronological order)
  const displayRows = statementRows

  const renderNote = (note: string) => {
    if (!note) return '';
    
    const prefixes = [
      'Production:', 'Purchase:', 'Sale:', 'Direct Garments:',
      'Payment for sale:', 'Payment received for sale:', 
      'Payment for production:', 'Payment for purchase:', 'Payment for cloth purchase:',
      'Payment for direct garments:'
    ];

    for (const prefix of prefixes) {
      if (note.toLowerCase().startsWith(prefix.toLowerCase())) {
        const remaining = note.substring(prefix.length).trim();
        const parts = remaining.split(' - ');
        const details = parts[0];
        const extraNote = parts.length > 1 ? ' - ' + parts.slice(1).join(' - ') : '';
        return (
          <>
            {note.substring(0, prefix.length)} <strong className="text-gray-900 font-bold">{details}</strong>{extraNote}
          </>
        );
      }
    }

    return note;
  };

  const formatBalance = (amount: number) => {
    if (amount === 0) return '₹0'
    return amount < 0 ? `-₹${Math.abs(amount).toLocaleString('en-IN')}` : `₹${amount.toLocaleString('en-IN')}`
  }

  // Add Sale Modal Calculations
  const saleQuantity = parseInt(saleFormData.quantity) || 0
  const saleRate = parseFloat(saleFormData.rate) || 0
  const saleTotalAmount = saleQuantity * saleRate
  const saleOldBalance = party?.current_balance || 0
  const saleTotalDue = saleOldBalance + saleTotalAmount
  const salePaidNow = parseFloat(saleFormData.paid_amount) || 0
  const saleNewBalance = saleTotalDue - salePaidNow

  // Add Production Modal Calculations
  const productionQuantity = parseInt(productionFormData.output_quantity) || 0
  const productionRate = parseFloat(productionFormData.rate_per_unit) || 0
  const productionTotalValue = productionQuantity * productionRate
  const productionPaidAmount = parseFloat(productionFormData.paid_amount) || 0
  const productionDueAmount = productionTotalValue - productionPaidAmount


  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 print:hidden">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 w-full sm:w-auto">
          <button onClick={() => router.back()} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 truncate">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            <span className="truncate">Account Statement</span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
          <button 
            onClick={() => window.print()} 
            className="flex-1 sm:flex-none bg-black text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors text-sm sm:text-base"
          >
            <Printer className="w-4 h-4 flex-shrink-0" />
            <span>Print</span>
          </button>
          <button 
            onClick={handleDownloadPDF} 
            className="flex-1 sm:flex-none bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            <Download className="w-4 h-4 flex-shrink-0" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      <div id="statement-content" className="bg-white rounded-xl border p-4 sm:p-6 mb-6">
        {/* Statement Header */}
        <div className="flex flex-col items-center justify-center border-b pb-6 mb-6">
          <img src="/icon.png" alt="IZTEXPORT" className="w-16 h-16 sm:w-24 sm:h-24 object-contain mb-2" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-gray-900 uppercase">IZTEXPORT</h1>
          <p className="text-sm sm:text-base font-medium text-gray-600 tracking-wider uppercase mt-1">BANGALORE</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start border-b pb-4 mb-4 gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{party.name}</h2>
            <p className="text-sm sm:text-base text-gray-500 capitalize mt-1">{party.party_type}</p>
            {party.phone && <p className="text-sm sm:text-base text-gray-600 mt-1">Phone: {party.phone}</p>}
            {party.address && <p className="text-sm sm:text-base text-gray-600">Address: {party.address}</p>}
          </div>
          <div className="w-full sm:w-auto text-left sm:text-right flex flex-col items-start sm:items-end">
            <p className="text-xs sm:text-sm text-gray-500">Current Balance</p>
            <p className={`text-2xl sm:text-3xl font-bold ${party.current_balance > 0 ? (party.party_type === 'customer' ? 'text-green-600' : 'text-red-600') : party.current_balance < 0 ? (party.party_type === 'customer' ? 'text-red-600' : 'text-green-600') : 'text-gray-900'}`}>
              {formatBalance(party.current_balance)}
            </p>
            <div className="flex flex-wrap gap-2 mt-3 print:hidden w-full sm:w-auto" data-html2canvas-ignore="true">
              {party.party_type === 'customer' && (
                <button 
                  onClick={openAddSaleModal}
                  className="flex-1 sm:flex-none text-xs sm:text-sm bg-black text-white px-3 sm:px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  Add+ Sale
                </button>
              )}
              {party.party_type === 'factory' && (
                <button 
                  onClick={openAddProductionModal}
                  className="flex-1 sm:flex-none text-xs sm:text-sm bg-black text-white px-3 sm:px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  Add+ Output
                </button>
              )}
              <button 
                onClick={() => setIsUpdateModalOpen(true)}
                className="flex-1 sm:flex-none text-xs sm:text-sm bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                +/- Update Balance
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b bg-gray-50 text-sm">
                <th className="p-3 font-semibold text-gray-600 whitespace-nowrap w-24">Date</th>
                <th className="p-3 font-semibold text-gray-600">Particulars</th>
                <th className="p-3 font-semibold text-gray-600 text-right w-32">Bill Amount (₹)</th>
                <th className="p-3 font-semibold text-gray-600 text-right w-32">Transfer / Cash (₹)</th>
                <th className="p-3 font-semibold text-gray-600 text-right w-32 relative">
                  <span className="pr-16">Balance (₹)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b-2 border-gray-300 bg-gray-100">
                <td colSpan={2} className="p-3 font-bold text-gray-900 text-right">Opening Balance</td>
                <td colSpan={2} className="p-3"></td>
                <td className="p-3 text-right font-bold text-gray-900 relative">
                  <span className="pr-16">{formatBalance(party.opening_balance || 0)}</span>
                </td>
              </tr>
              
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">No transactions found</td>
                </tr>
              ) : (
                displayRows.map((row, index) => {
                  const isNewSale = row.related_type === 'sale';
                  const needsDivider = isNewSale && index > 0;
                  const isCustomer = party.party_type === 'customer';
                  
                  const billAmount = isCustomer 
                    ? (row.entry_type === 'debit' ? row.amount : null)
                    : (row.entry_type === 'credit' ? row.amount : null);
                  
                  const paymentAmount = isCustomer
                    ? (row.entry_type === 'credit' ? row.amount : null)
                    : (row.entry_type === 'debit' ? row.amount : null);
                  
                  return (
                    <React.Fragment key={row.id}>
                      {needsDivider && (
                        <tr>
                          <td colSpan={5} className="h-4 bg-gray-100 border-y border-gray-200 print:hidden" data-html2canvas-ignore="true"></td>
                        </tr>
                      )}
                      <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 group">
                    <td className="p-3 whitespace-nowrap text-sm">
                      {new Date(row.entry_date).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="p-3">
                      <p className="font-semibold text-gray-900 capitalize">{row.related_type}</p>
                      <p className="text-sm text-gray-500">{renderNote(row.note)}</p>
                      {billAmount !== null && row.related_type !== 'adjustment' && (
                        <p className="text-xs font-medium text-gray-600 mt-1 bg-red-50 inline-block px-2 py-0.5 rounded border border-red-100">
                          (Old-Balance) {formatBalance(row.oldBalance)} + ₹{billAmount.toLocaleString('en-IN')} = {formatBalance(row.balance)}
                        </p>
                      )}
                      {paymentAmount !== null && row.related_type !== 'adjustment' && (
                        <p className="text-xs font-medium text-gray-600 mt-1 bg-green-50 inline-block px-2 py-0.5 rounded border border-green-100">
                          (Old-Balance) {formatBalance(row.oldBalance)} - ₹{paymentAmount.toLocaleString('en-IN')} = {formatBalance(row.balance)}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-right text-red-600 font-medium">
                      {billAmount !== null ? '₹' + billAmount.toLocaleString('en-IN') : '-'}
                    </td>
                    <td className="p-3 text-right text-green-600 font-medium">
                      {paymentAmount !== null ? '₹' + paymentAmount.toLocaleString('en-IN') : '-'}
                    </td>
                    <td className="p-3 text-right font-bold text-gray-900 relative">
                      <span className="pr-16">{formatBalance(row.balance)}</span>
                      {row.id !== 'manual-adjustment' && (
                        <div 
                          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                          data-html2canvas-ignore="true"
                        >
                          <button 
                            onClick={() => handleEditEntryClick(row)}
                            className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-200 rounded" 
                            title="Edit Entry"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setDeletingEntry(row)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" 
                            title="Delete Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                    </React.Fragment>
                  )
                })
              )}
              <tr className="border-t-2 border-gray-300 bg-gray-100 print:bg-gray-100">
                <td colSpan={2} className="p-3 font-bold text-gray-900 text-right">Closing Balance</td>
                <td colSpan={2} className="p-3"></td>
                <td className="p-3 text-right font-bold text-gray-900 relative">
                  <span className="pr-16">{formatBalance(party.current_balance)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Statement Footer */}
        <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row justify-between items-start sm:items-end gap-8">
          <div className="text-[10px] text-gray-500 max-w-md text-justify leading-tight order-2 sm:order-1">
            <strong className="block text-gray-700 mb-1 text-xs uppercase">Terms & Conditions</strong>
            At IZTEXPORT, we sincerely value and appreciate the trust and support of our customers; as we manage cloth sourcing, garment manufacturing through factories, and timely supply operations, we kindly request all payments to be made on time for smooth business flow. A 5% tax will be applicable for bill generation for customers.
          </div>
          <div className="flex flex-col items-center self-end order-1 sm:order-2">
            <div className="h-16 w-40 sm:w-48 border-b-2 border-gray-300 border-dashed mb-2"></div>
            <p className="font-bold text-gray-800 uppercase text-sm tracking-widest">IZTEXPORT</p>
            <p className="text-xs text-gray-500">Authorized Signature</p>
          </div>
        </div>
      </div>

      {/* Update Balance Modal */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Update Balance</h3>
              <button onClick={() => setIsUpdateModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUpdateType('receive')}
                    className={`py-2 px-4 rounded-lg border font-medium flex justify-center items-center gap-2 ${
                      updateType === 'receive' 
                        ? 'bg-green-50 border-green-500 text-green-700' 
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">+</span> Receive Money
                  </button>
                  <button
                    onClick={() => setUpdateType('give')}
                    className={`py-2 px-4 rounded-lg border font-medium flex justify-center items-center gap-2 ${
                      updateType === 'give' 
                        ? 'bg-red-50 border-red-500 text-red-700' 
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg">-</span> Give Money
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={updateDate}
                  onChange={(e) => setUpdateDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={updateAmount}
                  onChange={(e) => setUpdateAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note / Particulars (Optional)</label>
                <input 
                  type="text" 
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="e.g. Cash payment, Bank transfer"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>
            </div>

            <div className="pt-4 mt-6 border-t flex justify-end gap-3">
              <button 
                onClick={() => setIsUpdateModalOpen(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateBalance}
                disabled={isUpdating || !updateAmount}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Confirm Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Production Modal */}
      {isAddProductionModalOpen && party && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Add Production for {party.name}</h3>
              <button onClick={() => setIsAddProductionModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProduction} className="space-y-4">
              {/* Select Cloth Issue */}
              <div className="bg-white rounded-xl p-4 border">
                <label className="block text-sm font-medium mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Select Issued Cloth or Available Stock *
                </label>
                
                {issuesLoading ? (
                  <p className="text-center py-4 text-gray-500">Loading...</p>
                ) : (clothIssues.length === 0 && clothStocks.length === 0) ? (
                  <p className="text-center py-4 text-gray-500">No cloth available.</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {clothIssues.length > 0 && (
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">Currently Issued to {party.name}</div>
                    )}
                    {clothIssues.map(issue => (
                      <div
                        key={issue.id}
                        onClick={() => handleIssueSelect(issue, null)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedIssue?.id === issue.id
                            ? 'border-black bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {issue.cloth_purchase?.color_image_url && (
                          <img src={issue.cloth_purchase.color_image_url} alt={issue.cloth_purchase.cloth_color} className="w-12 h-12 object-cover rounded-lg" />
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
                        <button
                          type="button"
                          onClick={(e) => handleRemoveIssue(issue.id, e)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from active list"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}

                    {clothStocks.length > 0 && (
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4 pt-4 border-t">Available Raw Stock</div>
                    )}
                    {clothStocks.map(stock => (
                      <div
                        key={stock.id}
                        onClick={() => handleIssueSelect(null, stock)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedStock?.id === stock.id
                            ? 'border-black bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {stock.purchase?.color_image_url ? (
                          <img src={stock.purchase.color_image_url} alt={stock.cloth_color} className="w-12 h-12 object-cover rounded-lg" />
                        ) : (
                           <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium">
                            {stock.cloth_name}
                            {stock.cloth_color && ` - ${stock.cloth_color}`}
                          </p>
                          <p className="text-sm text-gray-600">
                            Available: {stock.meters_remaining}m
                          </p>
                        </div>
                        <div className="text-right">
                           <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Raw Stock</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedStock && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-blue-900">Meters to Issue for this Production *</label>
                    <input type="number" required min="0.01" max={selectedStock.meters_remaining} step="0.01" placeholder="Enter meters used" value={metersToIssue} onChange={(e) => setMetersToIssue(e.target.value)} className="w-full px-3 py-3 border rounded-lg border-blue-200 focus:ring-blue-500" />
                    <p className="text-xs text-blue-600 mt-1">
                      This will automatically issue the cloth from raw stock to {party.name} and record the production.
                    </p>
                  </div>
                </div>
              )}

              {/* Production Details */}
              {(selectedIssue || selectedStock) && (
                <div className="bg-white rounded-xl p-4 border space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Product Type</label>
                    <input type="text" required placeholder="e.g., Shirts, Pants" value={productionFormData.product_type} onChange={(e) => setProductionFormData({ ...productionFormData, product_type: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Quantity Produced *</label>
                      <input type="number" required min="1" placeholder="0" value={productionFormData.output_quantity} onChange={(e) => setProductionFormData({ ...productionFormData, output_quantity: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Unit</label>
                      <select value={productionFormData.output_unit} onChange={(e) => setProductionFormData({ ...productionFormData, output_unit: e.target.value })} className="w-full px-3 py-3 border rounded-lg bg-white">
                        <option value="pieces">Pieces</option>
                        <option value="sets">Sets</option>
                        <option value="pairs">Pairs</option>
                        <option value="meters">Meters</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Rate Per Unit (₹) *</label>
                    <input type="number" required min="0" step="0.01" placeholder="0.00" value={productionFormData.rate_per_unit} onChange={(e) => setProductionFormData({ ...productionFormData, rate_per_unit: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                  </div>

                  {productionTotalValue > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Production Value</span>
                        <span className="text-lg font-bold">₹{productionTotalValue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">Amount Paid Now (₹)</label>
                    <input type="number" min="0" max={productionTotalValue} step="0.01" value={productionFormData.paid_amount} onChange={(e) => setProductionFormData({ ...productionFormData, paid_amount: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                    {productionTotalValue > 0 && (
                      <p className="text-sm text-orange-600 mt-1">
                        Due after payment: ₹{productionDueAmount.toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Production Date *</label>
                    <input type="date" required value={productionFormData.production_date} onChange={(e) => setProductionFormData({ ...productionFormData, production_date: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Note</label>
                    <textarea rows={2} placeholder="Quality check notes, defects, etc." value={productionFormData.note} onChange={(e) => setProductionFormData({ ...productionFormData, note: e.target.value })} className="w-full px-3 py-3 border rounded-lg" />
                  </div>
                </div>
              )}

              <div className="pt-4 mt-6 border-t flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddProductionModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUpdating || (!selectedIssue && !selectedStock)}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {isUpdating ? 'Recording...' : 'Record Production'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Sale Modal */}
      {isAddSaleModalOpen && party && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Add Sale to {party.name}</h3>
              <button onClick={() => setIsAddSaleModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddSale} className="space-y-4">
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
                          if (saleFormData.product_type) setSaleFormData({ ...saleFormData, product_type: '' })
                          if (isNewProduct) setIsNewProduct(false)
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                        className="w-full pl-10 pr-3 py-3 border rounded-lg bg-white focus:ring-2 focus:ring-black outline-none"
                        disabled={productsLoading}
                        required
                      />
                    </div>
                    {saleFormData.product_type && !isNewProduct && (
                      <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium whitespace-nowrap">
                        ✓ In Stock
                      </span>
                    )}
                    {isNewProduct && (
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
                          <button type="button" key={stock.product_type} onClick={() => {
                            setSaleFormData({ ...saleFormData, product_type: stock.product_type })
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
                          setSaleFormData({ ...saleFormData, product_type: capitalizedNewProduct })
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

              {/* Sale Summary */}
              {(saleTotalAmount > 0 || saleOldBalance !== 0) && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">New Sale Amount</span>
                    <span className="font-semibold">₹{saleTotalAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Previous Dues</span>
                    <span className={`font-semibold ${saleOldBalance > 0 ? 'text-green-600' : saleOldBalance < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatBalance(saleOldBalance)}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex justify-between">
                    <span className="text-gray-900 font-medium">Total Due</span>
                    <span className="text-lg font-bold">
                      {formatBalance(saleTotalDue)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={productStocks.find(p => p.product_type === saleFormData.product_type)?.quantity}
                    placeholder="0"
                    value={saleFormData.quantity}
                    onChange={(e) => setSaleFormData({ ...saleFormData, quantity: e.target.value })}
                    className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                  />
                  {saleFormData.product_type && !isNewProduct && (
                    <div className="flex justify-between items-center mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-md border">
                      <span>In Stock: <span className="font-bold text-gray-800">{productStocks.find(p => p.product_type === saleFormData.product_type)?.quantity || 0}</span></span>
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
                    value={saleFormData.rate}
                    onChange={(e) => setSaleFormData({ ...saleFormData, rate: e.target.value })}
                    className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Amount Received Now (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={saleFormData.paid_amount}
                    onChange={(e) => setSaleFormData({ ...saleFormData, paid_amount: e.target.value })}
                    className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sale Date *</label>
                  <input
                    type="date"
                    required
                    value={saleFormData.sale_date}
                    onChange={(e) => setSaleFormData({ ...saleFormData, sale_date: e.target.value })}
                    className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
              </div>

              {/* New Balance Preview */}
              {(saleTotalAmount > 0 || saleOldBalance !== 0) && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-900 font-medium">Final Statement Balance</span>
                    <span className={`text-lg font-bold ${saleNewBalance > 0 ? 'text-green-600' : saleNewBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatBalance(saleNewBalance)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Note (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Any additional notes..."
                  value={saleFormData.note}
                  onChange={(e) => setSaleFormData({ ...saleFormData, note: e.target.value })}
                  className="w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div className="pt-4 mt-6 border-t flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddSaleModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUpdating || !saleFormData.product_type}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {isUpdating ? 'Recording...' : 'Record Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editingEntry && party && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Edit Entry</h3>
              <button onClick={() => setEditingEntry(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEntryEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  required
                  value={editEntryFormData.entry_date}
                  onChange={(e) => setEditEntryFormData({ ...editEntryFormData, entry_date: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  required
                  value={editEntryFormData.amount}
                  onChange={(e) => setEditEntryFormData({ ...editEntryFormData, amount: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note / Particulars</label>
                <textarea 
                  value={editEntryFormData.note}
                  onChange={(e) => setEditEntryFormData({ ...editEntryFormData, note: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              <div className="pt-4 mt-6 border-t flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Entry Modal */}
      {deletingEntry && party && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Delete Entry</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to completely remove this entry? This action cannot be undone and will update the party's balance.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingEntry(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                disabled={isUpdating}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteEntry}
                disabled={isUpdating}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isUpdating ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}