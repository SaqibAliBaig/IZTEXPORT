'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Factory, Package, ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Issue {
  id: string
  meters_given: number
  product_type: string
  issue_date: string
  note?: string
  factory_name: string
  cloth_name: string
  cloth_color: string
  color_image_url: string
}

export default function IssuesPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<Issue[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'last_month'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIssues()
  }, [])

  const fetchIssues = async () => {
    const { data: issuesData, error } = await supabase
      .from('cloth_issues')
      .select(`
        id,
        meters_given,
        product_type,
        issue_date,
        note,
        factory:parties!cloth_issues_factory_id_fkey(name),
        cloth_purchase:cloth_purchases!cloth_issues_cloth_purchase_id_fkey(cloth_name, cloth_color, color_image_url)
      `)
      .order('created_at', { ascending: false })

    if (issuesData) {
      const seen = new Set();
      const formattedIssues: Issue[] = [];
      
      for (const item of issuesData) {
        const issue = item as any;
        const factory_name = (Array.isArray(issue.factory) ? issue.factory[0]?.name : issue.factory?.name) || 'Unknown Factory';
        const cloth_name = (Array.isArray(issue.cloth_purchase) ? issue.cloth_purchase[0]?.cloth_name : issue.cloth_purchase?.cloth_name) || 'Unknown Cloth';
        const cloth_color = (Array.isArray(issue.cloth_purchase) ? issue.cloth_purchase[0]?.cloth_color : issue.cloth_purchase?.cloth_color) || '';
        const product_type = issue.product_type || 'Unspecified';
        
        // Create a unique key based on the issue details to filter out double-clicks
        const dupKey = `${factory_name}-${cloth_name}-${cloth_color}-${issue.meters_given}-${product_type}-${issue.issue_date}`;
        
        if (!seen.has(dupKey)) {
          seen.add(dupKey);
          formattedIssues.push({
            id: issue.id,
            meters_given: Number(issue.meters_given),
            product_type,
            issue_date: issue.issue_date,
            note: issue.note,
            factory_name,
            cloth_name,
            cloth_color,
            color_image_url: (Array.isArray(issue.cloth_purchase) ? issue.cloth_purchase[0]?.color_image_url : issue.cloth_purchase?.color_image_url) || ''
          });
        }
      }
      setIssues(formattedIssues)
    } else if (error) {
      console.error('Error fetching issues:', error)
    }
    setLoading(false)
  }

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.factory_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.cloth_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.cloth_color.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.product_type.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    if (dateFilter !== 'all') {
      const issueDate = new Date(issue.issue_date)
      const today = new Date()
      if (dateFilter === 'today') {
        matchesDate = issueDate.getDate() === today.getDate() && 
                      issueDate.getMonth() === today.getMonth() && 
                      issueDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'this_week') {
        const currentDay = today.getDay() || 7 // 1-7, where Monday is 1
        const startOfWeek = new Date(today)
        startOfWeek.setDate(startOfWeek.getDate() - (currentDay - 1))
        startOfWeek.setHours(0, 0, 0, 0)
        matchesDate = issueDate >= startOfWeek
      } else if (dateFilter === 'this_month') {
        matchesDate = issueDate.getMonth() === today.getMonth() && issueDate.getFullYear() === today.getFullYear()
      } else if (dateFilter === 'last_month') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        matchesDate = issueDate.getMonth() === lastMonth.getMonth() && issueDate.getFullYear() === lastMonth.getFullYear()
      }
    }

    return matchesSearch && matchesDate
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="w-6 h-6" />
            Issues History
          </h2>
        </div>
        <Link
          href="/issues/add"
          className="bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Issue Cloth
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex bg-white rounded-xl border p-1 overflow-x-auto">
          <button
            onClick={() => setDateFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All Time
          </button>
          <button
          onClick={() => setDateFilter('today')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'today' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Today
        </button>
        <button
          onClick={() => setDateFilter('this_week')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'this_week' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          This Week
        </button>
        <button
            onClick={() => setDateFilter('this_month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'this_month' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            This Month
          </button>
          <button
            onClick={() => setDateFilter('last_month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === 'last_month' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Last Month
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by factory, cloth name, color, or expected product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none"
          />
        </div>
      </div>

      {/* Issues List */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 h-24 border"></div>
          ))}
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
          <Factory className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No cloth issues found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredIssues.map(issue => (
            <div key={issue.id} className="relative group bg-white rounded-xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-400 hover:shadow-md">
              <div className="flex items-center gap-4">
                {issue.color_image_url ? (
                  <img src={issue.color_image_url} alt={issue.cloth_color} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border" />
                ) : (
                  <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-green-500" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{issue.factory_name}</h3>
                  <p className="text-sm text-gray-600">
                    {issue.cloth_name} {issue.cloth_color && `(${issue.cloth_color})`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Expected: {issue.product_type}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-blue-600">
                  {issue.meters_given.toLocaleString('en-IN')}m
                </p>
                <div className="flex items-center justify-end gap-1 mt-1 text-xs text-gray-500">
                  <span>{new Date(issue.issue_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  {issue.note && (
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Tooltip for Note */}
              {issue.note && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-xs p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-50 whitespace-pre-wrap">
                  <span className="font-semibold text-gray-300">Note:</span> {issue.note}
                  {/* Tooltip downward arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}