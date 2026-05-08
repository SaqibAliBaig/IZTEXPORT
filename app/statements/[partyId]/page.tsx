'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Printer, Edit2, Save, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import Link from 'next/link'

interface Party {
  id: string
  name: string
  party_type: string
  phone: string
  address: string
  opening_balance: number
  current_balance: number
}

interface LedgerEntry {
  id: string
  entry_type: string
  amount: number
  entry_date: string
  note: string
  related_type?: string
  related_id?: string
  created_at: string
}

export default function StatementPage() {
  const params = useParams()
  const partyId = params?.partyId as string
  const router = useRouter()
  const statementRef = useRef<HTMLDivElement>(null)
  const [party, setParty] = useState<Party | null>(null)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState({ date: '', note: '' })
  const [activeTab, setActiveTab] = useState<'ledger' | 'factory_records' | 'supplier_records' | 'customer_records'>('ledger')
  const [issues, setIssues] = useState<any[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [salesList, setSalesList] = useState<any[]>([])
  const [paymentsList, setPaymentsList] = useState<any[]>([])
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({})
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<string | null>(null)
  const [newTx, setNewTx] = useState({
    amount: '',
    type: 'credit',
    date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => {
    if (partyId) {
      fetchPartyData(true)
    }
  }, [partyId])

  const fetchPartyData = async (isInitial = false) => {
    // Fetch party details
    const { data: partyData } = await supabase
      .from('parties')
      .select('*')
      .eq('id', partyId)
      .single()

    if (partyData) {
      setParty(partyData)
      
      if (isInitial && partyData.party_type === 'factory') {
        setActiveTab('factory_records')
      }
      
      if (isInitial && partyData.party_type === 'supplier') {
        setActiveTab('supplier_records')
      }

      if (isInitial && partyData.party_type === 'customer') {
        setActiveTab('customer_records')
      }

      // If Factory, fetch all cloth issues and their production records for the dashboard
      if (partyData.party_type === 'factory') {
        const { data: issuesData } = await supabase
          .from('cloth_issues')
          .select(`
            *,
            cloth_purchase:cloth_purchases(cloth_name, cloth_color),
            production_records(*)
          `)
          .eq('factory_id', partyId)
          .order('issue_date', { ascending: false })
          .order('created_at', { ascending: false })
          
        if (issuesData) {
          setIssues(issuesData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
        }
      }

      // If Supplier, fetch all cloth purchases for the dashboard
      if (partyData.party_type === 'supplier') {
        const { data: purchasesData } = await supabase
          .from('cloth_purchases')
          .select(`
            *,
            cloth_stock (meters_purchased)
          `)
          .eq('supplier_id', partyId)
          .order('purchase_date', { ascending: false })
          .order('created_at', { ascending: false })
          
        if (purchasesData) {
          setPurchases(purchasesData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
        }
      }
    }

    // Fetch ledger entries
    let query = supabase
      .from('ledger_entries')
      .select('*')
      .eq('party_id', partyId)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    const { data: entriesData } = await query

    if (entriesData) {
      setEntries(entriesData)
    }

    if (partyData?.party_type === 'customer') {
      const { data: sData } = await supabase
        .from('sales')
        .select('*')
        .eq('customer_id', partyId)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (sData) setSalesList(sData)
    }

    const { data: pData } = await supabase
      .from('payments')
      .select('*')
      .eq('party_id', partyId)
    if (pData) setPaymentsList(pData)

    setLoading(false)
  }

  const handleEditClick = (entry: any) => {
    setEditingEntryId(entry.id)
    setEditingData({
      date: entry.date ? format(new Date(entry.date), 'yyyy-MM-dd') : '',
      note: entry.particulars
    })
  }

  const handleCancelEdit = () => {
    setEditingEntryId(null)
    setEditingData({ date: '', note: '' })
  }

  const handleSaveEdit = async () => {
    if (!editingEntryId) return

    const { error } = await supabase
      .from('ledger_entries')
      .update({
        note: editingData.note,
        entry_date: editingData.date
      })
      .eq('id', editingEntryId)

    if (error) {
      toast.error('Failed to update entry.')
    } else {
      toast.success('Entry updated successfully.')
      await fetchPartyData() // Re-fetch to re-calculate and re-sort
      handleCancelEdit()
    }
  }

  // Automatically align standard accounting signs (+/-)
  // Customers: Debits increase balance (Asset). Factories: Credits increase balance (Liability)
  const getBalanceChange = (type: string, amount: number) => {
    if (party?.party_type === 'customer') {
      return type === 'debit' ? amount : -amount
    } else {
      return type === 'credit' ? amount : -amount
    }
  }

  const handleDeleteTransaction = async (originalEntry: any) => {
    if (!window.confirm('Are you sure you want to delete this manual transaction? The balance will be adjusted accordingly.')) {
      return
    }

    try {
      // Reverse the balance impact
      const balanceAdjustment = getBalanceChange(originalEntry.entry_type, -originalEntry.amount)
      const newBalance = (party?.current_balance || 0) + balanceAdjustment

      const { error: ledgerError } = await supabase
        .from('ledger_entries')
        .delete()
        .eq('id', originalEntry.id)

      if (ledgerError) throw ledgerError

      const { error: partyError } = await supabase
        .from('parties')
        .update({ current_balance: newBalance })
        .eq('id', partyId)

      if (partyError) throw partyError

      toast.success('Transaction deleted successfully')
      fetchPartyData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to delete transaction')
    }
  }

  const handleAddTransaction = async () => {
    if (!newTx.amount || isNaN(Number(newTx.amount)) || Number(newTx.amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsAdding(true)
    try {
      const amountNum = Number(newTx.amount)
      
      const balanceChange = getBalanceChange(newTx.type, amountNum)
      const newBalance = (party?.current_balance || 0) + balanceChange

      const { error: ledgerError } = await supabase
        .from('ledger_entries')
        .insert({
          party_id: partyId,
          entry_type: newTx.type,
          amount: amountNum,
          entry_date: newTx.date,
          note: newTx.note,
          related_type: 'manual_payment'
        })

      if (ledgerError) throw ledgerError

      const { error: partyError } = await supabase
        .from('parties')
        .update({ current_balance: newBalance })
        .eq('id', partyId)

      if (partyError) throw partyError

      toast.success('Transaction added successfully')
      setIsAddModalOpen(false)
      setNewTx({ amount: '', type: 'credit', date: new Date().toISOString().split('T')[0], note: '' })
      fetchPartyData()
    } catch (e: any) {
      console.error(e)
      toast.error('Failed to add transaction')
    } finally {
      setIsAdding(false)
    }
  }

  const generatePDF = async () => {
    if (!statementRef.current) return

    const toastId = toast.loading('Generating PDF...')
    try {
      const canvas = await html2canvas(statementRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const margin = 15 // 15mm margin on all sides
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const imgWidth = pdfWidth - (margin * 2)
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight)
      pdf.save(`${party?.name}-statement.pdf`)
      toast.success('PDF downloaded successfully!', { id: toastId })
    } catch (error) {
      console.error('PDF generation failed:', error)
      toast.error('Failed to generate PDF', { id: toastId })
    }
  }

  const printStatement = () => {
    window.print()
  }

  const getBalanceColor = (balance: number) => {
    if (balance === 0) return 'text-gray-900'
    if (party?.party_type === 'customer') {
      return balance > 0 ? 'text-green-600' : 'text-red-600'
    } else {
      return balance > 0 ? 'text-red-600' : 'text-green-600'
    }
  }

  const togglePanel = (id: string) => {
    setExpandedPanels(prev => ({...prev, [id]: !prev[id]}))
  }

  const buildUnifiedLedger = () => {
    if (!party) return []
    const allEntries = entries.map(e => {
      let subtext = e.related_type
      let particulars = e.note || e.related_type

      if (e.related_type === 'production') {
        const prod = issues.flatMap(i => i.production_records || []).find(p => p.id === e.related_id)
        if (prod) {
          const issue = issues.find(i => i.id === prod.cloth_issue_id)
          if (issue) {
            subtext = `${issue.cloth_purchase?.cloth_name} ${issue.cloth_purchase?.cloth_color ? `(${issue.cloth_purchase.cloth_color})` : ''}`
          }
        }
      } else if (e.related_type === 'purchase') {
        const pur = purchases.find(p => p.id === e.related_id)
        if (pur) {
          subtext = pur.cloth_color || 'Cloth Purchase'
        }
      } else if (e.related_type === 'sale') {
        const sale = salesList.find(s => s.id === e.related_id)
        if (sale) {
          subtext = sale.note || 'Garment Sale'
        }
      } else if (e.related_type === 'payment') {
        const pay = paymentsList.find(p => p.id === e.related_id)
        if (pay) {
          subtext = pay.note || 'Payment Received/Made'
          if (pay.payment_mode) {
            particulars = `Payment (${pay.payment_mode.replace('_', ' ')})`
          }
        }
      } else if (e.related_type === 'manual_payment' || !e.related_type) {
        subtext = 'Manual Adjustment'
      }

      if (particulars === 'production') particulars = 'Production'
      if (particulars === 'purchase') particulars = 'Purchase'
      if (particulars === 'sale') particulars = 'Sale'
      if (particulars === 'payment') particulars = 'Payment'

      return {
        id: e.id,
        date: e.entry_date,
        particulars: particulars,
        subtext: subtext,
        debit: e.entry_type === 'debit' ? e.amount : 0,
        credit: e.entry_type === 'credit' ? e.amount : 0,
        isManual: e.related_type === 'manual_payment' || !e.related_type,
        originalEntry: e,
        createdAt: new Date(e.created_at).getTime()
      }
    })

    // Sort by Date, then by createdAt to maintain consistent order
    allEntries.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      if (dateA !== dateB) return dateA - dateB
      return a.createdAt - b.createdAt
    })

    return allEntries
  }

  const getUnifiedBalanceChange = (debit: number, credit: number) => {
    if (party?.party_type === 'customer') {
      return debit - credit
    } else {
      return credit - debit
    }
  }

  const unifiedEntries = buildUnifiedLedger()

  const filteredEntries = unifiedEntries.filter(entry => {
    if (!ledgerFilter) return true
    
    // For Factory Issues
    if (party?.party_type === 'factory') {
      const issue = issues.find(i => i.id === ledgerFilter)
      if (!issue) return false
      const prodIds = issue.production_records?.map((p: any) => p.id) || []
      
      if (entry.originalEntry.related_type === 'production') {
        return prodIds.includes(entry.originalEntry.related_id)
      }
      if (entry.originalEntry.related_type === 'payment') {
        const pay = paymentsList.find(p => p.id === entry.originalEntry.related_id)
        if (pay && pay.related_type === 'production') {
          return prodIds.includes(pay.related_id)
        }
      }
      return false
    }
    
    // For Supplier Purchases
    if (party?.party_type === 'supplier') {
      const purId = ledgerFilter
      if (entry.originalEntry.related_type === 'purchase') {
        return entry.originalEntry.related_id === purId
      }
      if (entry.originalEntry.related_type === 'payment') {
        const pay = paymentsList.find(p => p.id === entry.originalEntry.related_id)
        if (pay && pay.related_type === 'purchase') {
          return pay.related_id === purId
        }
      }
      return false
    }
    
    // For Customer Sales
    if (party?.party_type === 'customer') {
      const saleId = ledgerFilter
      if (entry.originalEntry.related_type === 'sale') {
        return entry.originalEntry.related_id === saleId
      }
      if (entry.originalEntry.related_type === 'payment') {
        const pay = paymentsList.find(p => p.id === entry.originalEntry.related_id)
        if (pay && pay.related_type === 'sale') {
          return pay.related_id === saleId
        }
      }
      return false
    }

    return true
  })

  const totalDebit = filteredEntries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredit = filteredEntries.reduce((sum, e) => sum + e.credit, 0)

  const openingBalance = ledgerFilter ? 0 : (party?.opening_balance || 0)
  let currentRunningBalance = openingBalance
  const entriesWithBalance = filteredEntries.map(entry => {
    currentRunningBalance += getUnifiedBalanceChange(entry.debit, entry.credit)
    return {
      ...entry,
      runningBalance: currentRunningBalance
    }
  })
  const closingBalance = currentRunningBalance

  // Pre-calculate dues based on FIFO allocation of current overall balance
  const factoryProductionDues = new Map<string, { due: number, paid: number }>();
  const supplierPurchaseDues = new Map<string, { due: number, paid: number }>();
  const customerSaleDues = new Map<string, { due: number, paid: number }>();

  if (party) {
    let remainingBalance = Math.max(0, party.current_balance);

    if (party.party_type === 'factory') {
      const allRecords = issues.flatMap(i => i.production_records || []).sort((a, b) => {
        const dateA = new Date(a.production_date || a.created_at).getTime();
        const dateB = new Date(b.production_date || b.created_at).getTime();
        return dateB - dateA;
      });
      for (const record of allRecords) {
        const totalVal = Number(record.total_value) || 0;
        const due = Math.min(totalVal, remainingBalance);
        const paid = totalVal - due;
        factoryProductionDues.set(record.id, { due, paid });
        remainingBalance -= due;
      }
    } else if (party.party_type === 'supplier') {
      const allPurchases = [...purchases].sort((a, b) => {
        const dateA = new Date(a.purchase_date || a.created_at).getTime();
        const dateB = new Date(b.purchase_date || b.created_at).getTime();
        return dateB - dateA;
      });
      for (const purchase of allPurchases) {
        const stockMeters = Array.isArray(purchase.cloth_stock) ? purchase.cloth_stock[0]?.meters_purchased : purchase.cloth_stock?.meters_purchased;
        const meters = purchase.meters_purchased || purchase.meters || stockMeters || 0;
        const totalVal = Number(purchase.total_amount) || Number(purchase.total_value) || (meters * Number(purchase.rate || purchase.rate_per_meter || 0)) || 0;
        const due = Math.min(totalVal, remainingBalance);
        const paid = totalVal - due;
        supplierPurchaseDues.set(purchase.id, { due, paid });
        remainingBalance -= due;
      }
    } else if (party.party_type === 'customer') {
      const allSales = [...salesList].sort((a, b) => {
        const dateA = new Date(a.sale_date || a.created_at).getTime();
        const dateB = new Date(b.sale_date || b.created_at).getTime();
        return dateB - dateA;
      });
      for (const sale of allSales) {
        const totalVal = Number(sale.total_amount) || 0;
        const due = Math.min(totalVal, remainingBalance);
        const paid = totalVal - due;
        customerSaleDues.set(sale.id, { due, paid });
        remainingBalance -= due;
      }
    }
  }

  let fifoDue = 0;
  let fifoPaid = 0;
  let specificPaid = 0;
  
  if (ledgerFilter) {
    if (party?.party_type === 'factory') {
      const issue = issues.find(i => i.id === ledgerFilter);
      if (issue) {
        issue.production_records?.forEach((p: any) => {
          const dues = factoryProductionDues.get(p.id) || { due: 0, paid: Number(p.total_value) || 0 };
          fifoDue += dues.due;
          fifoPaid += dues.paid;
        });
      }
      specificPaid = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
    } else if (party?.party_type === 'supplier') {
      const pur = purchases.find(p => p.id === ledgerFilter);
      if (pur) {
        const stockMeters = Array.isArray(pur.cloth_stock) ? pur.cloth_stock[0]?.meters_purchased : pur.cloth_stock?.meters_purchased;
        const meters = pur.meters_purchased || pur.meters || stockMeters || 0;
        const totalValue = Number(pur.total_amount) || Number(pur.total_value) || (meters * Number(pur.rate || pur.rate_per_meter || 0)) || 0;
        const dues = supplierPurchaseDues.get(pur.id) || { due: 0, paid: totalValue };
        fifoDue = dues.due;
        fifoPaid = dues.paid;
      }
      specificPaid = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
    } else if (party?.party_type === 'customer') {
      const sale = salesList.find(s => s.id === ledgerFilter);
      if (sale) {
        const totalValue = Number(sale.total_amount) || 0;
        const dues = customerSaleDues.get(sale.id) || { due: 0, paid: totalValue };
        fifoDue = dues.due;
        fifoPaid = dues.paid;
      }
      specificPaid = filteredEntries.reduce((sum, e) => sum + e.credit, 0);
    }
  }

  let virtualEntry: any = null;
  let finalClosingBalance = closingBalance;

  if (ledgerFilter) {
    const allocated = fifoPaid - specificPaid;
    
    if (Math.abs(allocated) > 0.01) {
      const isCustomer = party?.party_type === 'customer';
      virtualEntry = {
        id: 'virtual-allocation',
        date: null,
        particulars: allocated > 0 ? 'Payment' : 'Adjustment',
        subtext: 'Manual Update',
        debit: isCustomer ? (allocated < 0 ? Math.abs(allocated) : 0) : (allocated > 0 ? allocated : 0),
        credit: isCustomer ? (allocated > 0 ? allocated : 0) : (allocated < 0 ? Math.abs(allocated) : 0),
        isManual: false,
        originalEntry: {},
      };
      
      const change = getUnifiedBalanceChange(virtualEntry.debit, virtualEntry.credit);
      virtualEntry.runningBalance = closingBalance + change;
      finalClosingBalance = virtualEntry.runningBalance;
    }
  }

  const displayTotalDebit = totalDebit + (virtualEntry?.debit || 0);
  const displayTotalCredit = totalCredit + (virtualEntry?.credit || 0);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!party) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p>Party not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Actions Bar */}
      <div className="flex justify-between items-center mb-6 no-print">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center">
            {party.name}
            <span className="text-sm font-medium text-gray-500 capitalize px-3 py-1 bg-gray-100 rounded-full ml-3">{party.party_type}</span>
          </h2>
        </div>
        <div className="flex gap-3">
          {activeTab === 'ledger' && (
            <>
              <button onClick={generatePDF} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg"><Download className="w-4 h-4" /> Download PDF</button>
              <button onClick={printStatement} className="flex items-center gap-2 border px-4 py-2 rounded-lg"><Printer className="w-4 h-4" /> Print</button>
            </>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Update Balance (+/-)
          </button>
        </div>
      </div>

      {party.party_type === 'factory' && (
        <div className="flex gap-2 mb-6 no-print bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('factory_records')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'factory_records' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Production & Issues
          </button>
          <button
            onClick={() => { setActiveTab('ledger'); setLedgerFilter(null); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'ledger' && !ledgerFilter ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Full Financial Ledger
          </button>
        </div>
      )}

      {party.party_type === 'supplier' && (
        <div className="flex gap-2 mb-6 no-print bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('supplier_records')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'supplier_records' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Purchases & Payments
          </button>
          <button
            onClick={() => { setActiveTab('ledger'); setLedgerFilter(null); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'ledger' && !ledgerFilter ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Full Financial Ledger
          </button>
        </div>
      )}

      {party.party_type === 'customer' && (
        <div className="flex gap-2 mb-6 no-print bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('customer_records')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'customer_records' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Sales & Payments
          </button>
          <button
            onClick={() => { setActiveTab('ledger'); setLedgerFilter(null); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold transition-all ${activeTab === 'ledger' && !ledgerFilter ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Full Financial Ledger
          </button>
        </div>
      )}

      {/* Factory Records Content */}
      {party.party_type === 'factory' && (
        <div className={activeTab === 'factory_records' ? 'block' : 'hidden'}>
          <div className="space-y-6">
            {/* Summary Header */}
            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-purple-900 mb-1">Factory Production Status</h3>
                  <p className="text-sm text-purple-700">Track cloth given, garments received, and payments made.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-purple-700 font-medium">Overall Balance</p>
                  <p className={`text-3xl font-bold ${getBalanceColor(party.current_balance)}`}>
                    ₹{Math.abs(party.current_balance).toLocaleString('en-IN')}
                    <span className="text-sm font-normal ml-1 text-gray-600">
                      {party.current_balance > 0 ? '(To Pay)' : party.current_balance < 0 ? '(Advance/Credit)' : ''}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-purple-200 flex gap-4">
                <Link href={`/production/add?factoryId=${party.id}`} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                  + Log Received Garments
                </Link>
                <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-purple-700 border border-purple-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors">
                  + Record Payment
                </button>
              </div>
            </div>

            {/* Issues List */}
            <div className="space-y-4">
              {issues.map(issue => {
                const totalGarments = issue.production_records?.reduce((sum: number, r: any) => sum + Number(r.output_quantity), 0) || 0
                const totalValue = issue.production_records?.reduce((sum: number, r: any) => sum + Number(r.total_value), 0) || 0
                const totalPaid = issue.production_records?.reduce((sum: number, r: any) => {
                  const { paid } = factoryProductionDues.get(r.id) || { due: 0, paid: Number(r.total_value) || 0 };
                  return sum + paid;
                }, 0) || 0

                return (
                  <div key={issue.id} className="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 border-l-purple-500">
                    <div 
                      className="p-4 bg-gray-50 border-b flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => togglePanel(issue.id)}
                    >
                      <div>
                        <p className="text-sm text-gray-500">{issue.issue_date ? format(new Date(issue.issue_date), 'dd MMM yyyy') : 'N/A'}</p>
                        <h4 className="font-bold text-lg text-gray-900">
                          {issue.cloth_purchase?.cloth_name} {issue.cloth_purchase?.cloth_color && `(${issue.cloth_purchase.cloth_color})`}
                        </h4>
                        <p className="text-sm font-medium text-blue-600">Cloth Issued: {issue.meters_given}m</p>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Target Product</p>
                          <p className="font-bold text-gray-900">{issue.product_type || 'Garments'}</p>
                        </div>
                        {expandedPanels[issue.id] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                    
                    {expandedPanels[issue.id] && (
                    <div className="p-4">
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Garments Received Log</h5>
                      
                      {issue.production_records && issue.production_records.length > 0 ? (
                        <div className="space-y-2 mb-4">
                          {issue.production_records.map((record: any) => {
                            const { due, paid } = factoryProductionDues.get(record.id) || { due: 0, paid: Number(record.total_value) || 0 };
                            return (
                              <div key={record.id} className="flex justify-between items-center text-sm p-3 bg-white rounded-lg border shadow-sm">
                                <div>
                                  <span className="font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md text-base">+{record.output_quantity} pieces</span>
                                  <p className="text-xs text-gray-500 mt-1">{record.production_date ? format(new Date(record.production_date), 'dd MMM yyyy') : 'N/A'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-900 font-medium">Value: ₹{Number(record.total_value).toLocaleString('en-IN')}</p>
                                  {paid > 0 && <p className="text-green-600 text-xs mt-0.5">Paid: ₹{paid.toLocaleString('en-IN')}</p>}
                                  {due > 0 && <p className="text-red-600 font-bold text-xs mt-0.5">Remaining Due: ₹{due.toLocaleString('en-IN')}</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic mb-4">No garments received yet for this issue.</p>
                      )}

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div className="flex gap-6">
                          <div><p className="text-xs text-gray-500">Total Received</p><p className="font-bold text-green-600 text-lg">{totalGarments}</p></div>
                          <div><p className="text-xs text-gray-500">Total Value</p><p className="font-bold text-gray-900 text-lg">₹{totalValue.toLocaleString('en-IN')}</p></div>
                          <div><p className="text-xs text-gray-500">Total Paid</p><p className="font-bold text-blue-600 text-lg">₹{totalPaid.toLocaleString('en-IN')}</p></div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setLedgerFilter(issue.id)
                              setActiveTab('ledger')
                            }}
                            className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors shadow-sm"
                          >
                            View Ledger
                          </button>
                          <Link href={`/production/add?issueId=${issue.id}&factoryId=${party.id}`} className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-purple-100 transition-colors shadow-sm">+ Receive More</Link>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Supplier Records Content */}
      {party.party_type === 'supplier' && (
        <div className={activeTab === 'supplier_records' ? 'block' : 'hidden'}>
          <div className="space-y-6">
            {/* Summary Header */}
            <div className="bg-pink-50 rounded-xl p-6 border border-pink-100">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-pink-900 mb-1">Supplier Purchase Status</h3>
                  <p className="text-sm text-pink-700">Track cloth purchased, values, and payments made.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-pink-700 font-medium">Overall Balance</p>
                  <p className={`text-3xl font-bold ${getBalanceColor(party.current_balance)}`}>
                    ₹{Math.abs(party.current_balance).toLocaleString('en-IN')}
                    <span className="text-sm font-normal ml-1 text-gray-600">
                      {party.current_balance > 0 ? '(To Pay)' : party.current_balance < 0 ? '(Advance/Credit)' : ''}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-pink-200 flex gap-4">
                <Link href={`/purchases/add?supplierId=${party.id}`} className="bg-pink-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pink-700 transition-colors shadow-sm">
                  + Log New Purchase
                </Link>
                <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-pink-700 border border-pink-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-pink-50 transition-colors">
                  + Record Payment
                </button>
              </div>
            </div>

            {/* Purchases List */}
            <div className="space-y-4">
              {purchases.map(purchase => {
                const stockMeters = Array.isArray(purchase.cloth_stock) ? purchase.cloth_stock[0]?.meters_purchased : purchase.cloth_stock?.meters_purchased
                const meters = purchase.meters_purchased || purchase.meters || stockMeters || 0
                const totalValue = Number(purchase.total_amount) || Number(purchase.total_value) || (meters * Number(purchase.rate || purchase.rate_per_meter || 0)) || 0
                const { due, paid } = supplierPurchaseDues.get(purchase.id) || { due: 0, paid: totalValue };

                return (
                  <div key={purchase.id} className="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 border-l-pink-500">
                    <div 
                      className="p-4 bg-gray-50 border-b flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => togglePanel(purchase.id)}
                    >
                      <div>
                        <p className="text-sm text-gray-500">{purchase.purchase_date ? format(new Date(purchase.purchase_date), 'dd MMM yyyy') : 'N/A'}</p>
                        <h4 className="font-bold text-lg text-gray-900">
                          {purchase.cloth_name} {purchase.cloth_color && `(${purchase.cloth_color})`}
                        </h4>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="font-bold text-gray-900">{meters}m</p>
                          <p className="text-sm text-gray-500">Quantity</p>
                        </div>
                        {expandedPanels[purchase.id] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                    
                    {expandedPanels[purchase.id] && (
                    <div className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex gap-6">
                          <div><p className="text-xs text-gray-500">Total Value</p><p className="font-bold text-gray-900 text-lg">₹{totalValue.toLocaleString('en-IN')}</p></div>
                          <div><p className="text-xs text-gray-500">Paid</p><p className="font-bold text-green-600 text-lg">₹{paid.toLocaleString('en-IN')}</p></div>
                          {due > 0 && <div><p className="text-xs text-gray-500">Remaining Due</p><p className="font-bold text-red-600 text-lg">₹{due.toLocaleString('en-IN')}</p></div>}
                        </div>
                        <button 
                          onClick={() => {
                            setLedgerFilter(purchase.id)
                            setActiveTab('ledger')
                          }}
                          className="bg-pink-50 text-pink-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-pink-100 transition-colors shadow-sm"
                        >
                          View Ledger
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                )
              })}
              {purchases.length === 0 && (
                <p className="text-center text-gray-500 py-8 bg-gray-50 rounded-xl border">No purchases found for this supplier.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Records Content */}
      {party.party_type === 'customer' && (
        <div className={activeTab === 'customer_records' ? 'block' : 'hidden'}>
          <div className="space-y-6">
            {/* Summary Header */}
            <div className="bg-orange-50 rounded-xl p-6 border border-orange-100">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-orange-900 mb-1">Customer Sales Status</h3>
                  <p className="text-sm text-orange-700">Track garments sold, values, and payments received.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-orange-700 font-medium">Overall Balance</p>
                  <p className={`text-3xl font-bold ${getBalanceColor(party.current_balance)}`}>
                    ₹{Math.abs(party.current_balance).toLocaleString('en-IN')}
                    <span className="text-sm font-normal ml-1 text-gray-600">
                      {party.current_balance > 0 ? '(To Collect)' : party.current_balance < 0 ? '(Advance)' : ''}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-orange-200 flex gap-4">
                <Link href={`/sales/add?customerId=${party.id}`} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors shadow-sm">
                  + Log New Sale
                </Link>
                <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-orange-700 border border-orange-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors">
                  + Record Payment
                </button>
              </div>
            </div>

            {/* Sales List */}
            <div className="space-y-4">
              {salesList.map(sale => {
                const quantity = sale.quantity || 0
                const totalValue = Number(sale.total_amount) || 0
                const { due, paid } = customerSaleDues.get(sale.id) || { due: 0, paid: totalValue };

                return (
                  <div key={sale.id} className="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 border-l-orange-500">
                    <div 
                      className="p-4 bg-gray-50 border-b flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => togglePanel(sale.id)}
                    >
                      <div>
                        <p className="text-sm text-gray-500">{sale.sale_date ? format(new Date(sale.sale_date), 'dd MMM yyyy') : 'N/A'}</p>
                        <h4 className="font-bold text-lg text-gray-900">
                          {sale.product_type}
                        </h4>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="font-bold text-gray-900">{quantity} pieces</p>
                          <p className="text-sm text-gray-500">Quantity</p>
                        </div>
                        {expandedPanels[sale.id] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                    
                    {expandedPanels[sale.id] && (
                    <div className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex gap-6">
                          <div><p className="text-xs text-gray-500">Total Value</p><p className="font-bold text-gray-900 text-lg">₹{totalValue.toLocaleString('en-IN')}</p></div>
                          <div><p className="text-xs text-gray-500">Paid</p><p className="font-bold text-green-600 text-lg">₹{paid.toLocaleString('en-IN')}</p></div>
                          {due > 0 && <div><p className="text-xs text-gray-500">Remaining Due</p><p className="font-bold text-red-600 text-lg">₹{due.toLocaleString('en-IN')}</p></div>}
                        </div>
                        <button 
                          onClick={() => {
                            setLedgerFilter(sale.id)
                            setActiveTab('ledger')
                          }}
                          className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-100 transition-colors shadow-sm"
                        >
                          View Ledger
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                )
              })}
              {salesList.length === 0 && (
                <p className="text-center text-gray-500 py-8 bg-gray-50 rounded-xl border">No sales found for this customer.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statement Content */}
      <div className={activeTab === 'ledger' ? 'block' : 'hidden'}>
        
        {ledgerFilter && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-6 flex justify-between items-center no-print">
            <span className="font-medium">Viewing filtered ledger statement for selected record.</span>
            <button onClick={() => setLedgerFilter(null)} className="text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-100 px-3 py-1 rounded-md transition-colors">
              Clear Filter
            </button>
          </div>
        )}

        <div ref={statementRef} className="bg-white rounded-xl shadow-sm border p-8 print:p-4">
        {/* Header */}
        <div className="text-center mb-8 border-b pb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">StitchBook</h1>
          <p className="text-gray-600">
            {ledgerFilter ? 'Filtered Account Statement' : 'Account Statement'}
          </p>
        </div>

        {/* Party Info */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{party.name}</h2>
            <p className="text-gray-600 capitalize">{party.party_type}</p>
            {party.phone && <p className="text-gray-600">📱 {party.phone}</p>}
            {party.address && <p className="text-gray-600">📍 {party.address}</p>}
          </div>
          <div className="text-right">
            {!ledgerFilter ? (
              <>
                <p className="text-sm text-gray-500">Opening Balance</p>
                <p className="text-lg font-bold">₹{party.opening_balance.toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-500 mt-4">Closing Balance</p>
                <p className={`text-lg font-bold ${getBalanceColor(party.current_balance)}`}>
                  ₹{party.current_balance.toLocaleString('en-IN')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">Sub-ledger Balance</p>
                <p className={`text-xl font-bold ${getBalanceColor(finalClosingBalance)}`}>
                  ₹{finalClosingBalance.toLocaleString('en-IN')}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-2 text-sm font-semibold text-gray-600">Date</th>
                <th className="text-left py-3 px-2 text-sm font-semibold text-gray-600">Particulars</th>
                <th className="text-right py-3 px-2 text-sm font-semibold text-gray-600">Debit (₹)</th>
                <th className="text-right py-3 px-2 text-sm font-semibold text-gray-600">Credit (₹)</th>
                <th className="text-right py-3 px-2 text-sm font-semibold text-gray-600">Balance (₹)</th>
                <th className="text-right py-3 px-2 text-sm font-semibold text-gray-600 no-print" data-html2canvas-ignore="true">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening Balance Row */}
              {!ledgerFilter && (
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 text-sm text-gray-500">-</td>
                  <td className="py-3 px-2 text-sm font-medium">Opening Balance</td>
                  <td className="py-3 px-2 text-right text-sm"></td>
                  <td className="py-3 px-2 text-right text-sm"></td>
                  <td className="py-3 px-2 text-right text-sm font-bold">
                    ₹{openingBalance.toLocaleString('en-IN')}
                  </td>
                  <td className="no-print" data-html2canvas-ignore="true"></td>
                </tr>
              )}

              {/* Ledger Entries */}
              {entriesWithBalance.map((entry) => {
                return (
                  editingEntryId === entry.id ? (
                    <tr key={entry.id} className="bg-blue-50">
                      <td className="py-2 px-2">
                        <input type="date" value={editingData.date} onChange={(e) => setEditingData({...editingData, date: e.target.value})} className="w-full p-1 border rounded-md"/>
                      </td>
                      <td className="py-2 px-2">
                        <input type="text" value={editingData.note} onChange={(e) => setEditingData({...editingData, note: e.target.value})} className="w-full p-1 border rounded-md"/>
                      </td>
                      <td className="py-2 px-2 text-right text-sm">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right text-sm">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right text-sm font-semibold">
                        ₹{entry.runningBalance.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-2 text-right no-print" data-html2canvas-ignore="true">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleSaveEdit()} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save className="w-4 h-4"/></button>
                          <button onClick={handleCancelEdit} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X className="w-4 h-4"/></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm">
                        {entry.date ? format(new Date(entry.date), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        <p className="font-medium">{entry.particulars}</p>
                        <p className="text-xs text-gray-500 capitalize">{entry.subtext}</p>
                      </td>
                      <td className="py-3 px-2 text-right text-sm">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-3 px-2 text-right text-sm">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className={`py-3 px-2 text-right text-sm font-semibold ${getBalanceColor(entry.runningBalance)}`}>
                        ₹{entry.runningBalance.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-2 text-right no-print" data-html2canvas-ignore="true">
                        <div className="flex justify-end gap-1">
                          {entry.isManual && (
                            <>
                              <button onClick={() => handleEditClick(entry)} className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-full" title="Edit"><Edit2 className="w-4 h-4"/></button>
                              <button onClick={() => handleDeleteTransaction(entry.originalEntry)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full" title="Delete"><Trash2 className="w-4 h-4"/></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )
              })}

              {/* Virtual Entry if present */}
              {virtualEntry && (
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-2 text-sm text-center">-</td>
                  <td className="py-3 px-2 text-sm">
                    <p className="font-medium text-gray-900">{virtualEntry.particulars}</p>
                    <p className="text-xs text-gray-500">{virtualEntry.subtext}</p>
                  </td>
                  <td className="py-3 px-2 text-right text-sm">
                    {virtualEntry.debit > 0 ? `₹${virtualEntry.debit.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td className="py-3 px-2 text-right text-sm">
                    {virtualEntry.credit > 0 ? `₹${virtualEntry.credit.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td className={`py-3 px-2 text-right text-sm font-semibold ${getBalanceColor(virtualEntry.runningBalance)}`}>
                    ₹{virtualEntry.runningBalance.toLocaleString('en-IN')}
                  </td>
                  <td className="no-print" data-html2canvas-ignore="true"></td>
                </tr>
              )}

            </tbody>

            {/* Totals */}
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-bold">
                <td colSpan={2} className="py-3 px-2 text-sm">Total Transactions</td>
                <td className="py-3 px-2 text-right text-sm">₹{displayTotalDebit.toLocaleString('en-IN')}</td>
                <td className="py-3 px-2 text-right text-sm">₹{displayTotalCredit.toLocaleString('en-IN')}</td>
                <td className={`py-3 px-2 text-right text-sm font-bold ${getBalanceColor(finalClosingBalance)}`}>
                  ₹{finalClosingBalance.toLocaleString('en-IN')}
                </td>
                <td className="no-print" data-html2canvas-ignore="true"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm text-gray-500">Generated on: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Authorized Signature</p>
              <div className="mt-8 border-b border-gray-300"></div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Add Transaction Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Update Balance</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTx({...newTx, type: 'credit'})}
                    className={`py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      newTx.type === 'credit' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {party?.party_type === 'customer' ? 'Receive Payment (-)' : 'Add Bill / Due (+)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTx({...newTx, type: 'debit'})}
                    className={`py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      newTx.type === 'debit' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {party?.party_type === 'customer' ? 'Give Payment (+)' : 'Give Payment (-)'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {party?.party_type === 'customer' 
                    ? (newTx.type === 'credit' 
                    ? 'This will decrease their outstanding balance.' 
                      : 'This will increase their outstanding balance.')
                    : (newTx.type === 'debit'
                      ? 'This will decrease what you owe them.'
                      : 'This will increase what you owe them.')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input type="number" value={newTx.amount} onChange={(e) => setNewTx({...newTx, amount: e.target.value})} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-black outline-none" placeholder="0.00" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={newTx.date} onChange={(e) => setNewTx({...newTx, date: e.target.value})} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-black outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input type="text" value={newTx.note} onChange={(e) => setNewTx({...newTx, note: e.target.value})} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-black outline-none" placeholder="e.g., Cash payment, Bank transfer..." />
              </div>

              <div className="pt-4 flex gap-3">
                <button onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-2 border rounded-xl hover:bg-gray-50 font-medium">Cancel</button>
                <button onClick={handleAddTransaction} disabled={isAdding} className="flex-1 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 font-medium">
                  {isAdding ? 'Saving...' : 'Save Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .max-w-4xl { max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}