import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import Image from 'next/image'
import Link from 'next/link'
import TopNav from './TopNav'
import BottomNav from './BottomNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'StitchBook',
  description: 'Complete cloth-to-factory-to-customer management',
  icons: {
    icon: '/Gemini_Generated_Image_b4mwbsb4mwbsb4mw.png?v=2',
    apple: '/Gemini_Generated_Image_b4mwbsb4mwbsb4mw.png?v=2',
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