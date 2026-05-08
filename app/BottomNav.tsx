'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Package, Factory, Warehouse, Shirt, TrendingUp, FileText, Wallet } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 print:hidden overflow-x-auto">
      <div className="max-w-7xl mx-auto px-4 min-w-[600px]">
        <div className="flex justify-around py-3">
          <Link href="/" className={`flex flex-col items-center transition-colors ${pathname === '/' ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Package className="w-5 h-5" />
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link href="/purchases" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/purchases') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Package className="w-5 h-5" />
            <span className="text-xs mt-1">Purchases</span>
          </Link>
          <Link href="/stock" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/stock') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Warehouse className="w-5 h-5" />
            <span className="text-xs mt-1">Stock</span>
          </Link>
          <Link href="/issues" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/issues') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Factory className="w-5 h-5" />
            <span className="text-xs mt-1">Issues</span>
          </Link>
          <Link href="/production" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/production') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Shirt className="w-5 h-5" />
            <span className="text-xs mt-1">Production</span>
          </Link>
          <Link href="/sales" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/sales') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <TrendingUp className="w-5 h-5" />
            <span className="text-xs mt-1">Sales</span>
          </Link>
          <Link href="/statements" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/statements') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <FileText className="w-5 h-5" />
            <span className="text-xs mt-1">Reports</span>
          </Link>
          <Link href="/payments" className={`flex flex-col items-center transition-colors ${pathname?.startsWith('/payments') ? 'text-black' : 'text-gray-500 hover:text-black'}`}>
            <Wallet className="w-5 h-5" />
            <span className="text-xs mt-1">Payments</span>
          </Link>
        </div>
      </div>
    </div>
  )
}