'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  
  if (pathname === '/login') return null

  const handleLogout = () => {
    document.cookie = "stitchbook_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    toast.success('Logged out')
    router.push('/login')
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="w-10"></div> {/* Spacer for centering */}
        <Link href="/" className="flex items-center justify-center gap-3 hover:opacity-90 transition-opacity cursor-pointer">
          
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">IZTEXPORT</h1>
        </Link>
        <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Logout">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </nav>
  )
}