import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import BottomNav from './BottomNav'
import TopNav from './TopNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'IZTEXPORT',
  description: 'Complete cloth-to-factory-to-customer management',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}>
        <Toaster position="top-right" />
        <div className="min-h-screen pb-20">
          <TopNav />
          {children}
          <BottomNav />
        </div>
      </body>
    </html>
  )
}