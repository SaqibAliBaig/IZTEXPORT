'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(prevState: { error: string | undefined }, formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  // Simulate a slight delay for better UX
  await new Promise(resolve => setTimeout(resolve, 600))

  if (
    email === process.env.AUTH_USER &&
    password === process.env.AUTH_PASS
  ) {
    const cookieStore = await cookies()
    cookieStore.set('stitchbook_auth', 'authenticated', {
      path: '/',
      maxAge: 31536000, // 1 year
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
    redirect('/')
  } else {
    return { error: 'Invalid email or password' }
  }
}