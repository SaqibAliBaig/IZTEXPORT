'use client'

import { useEffect, useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { Lock, Mail, ArrowRight } from 'lucide-react'
import { login } from './actions'

function LoginButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-black text-white py-3 rounded-xl text-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-70 mt-2"
    >
      {pending ? 'Signing in...' : 'Sign In'}
      {!pending && <ArrowRight className="w-5 h-5" />}
    </button>
  )
}

export default function LoginPage() {
  const initialState: { error: string | undefined } = { error: undefined }
  const [state, formAction] = useActionState(login, initialState)

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  return (
    <div className="min-h-[80vh] bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8">
        <div className="flex flex-col items-center mb-8 text-center">
          <Image 
            src="/Gemini_Generated_Image_b4mwbsb4mwbsb4mw.png" 
            alt="StitchBook Logo" 
            width={64} 
            height={64} 
            className="rounded-xl object-cover mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900">Welcome to StitchBook</h1>
          <p className="text-gray-500 text-sm mt-1">Please sign in to continue</p>
        </div>

        <form action={formAction} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
              <input
                type="email"
                name="email"
                required
                className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
              <input
                type="password"
                name="password"
                required
                className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-black outline-none transition-all"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <LoginButton />

        </form>
      </div>
    </div>
  )
}
