'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(
  prevState: { error: string | undefined } | undefined,
  formData: FormData
) {
  const email = formData.get('email')
  const password = formData.get('password')

  // Simulate a slight delay for better UX
  await new Promise(resolve => setTimeout(resolve, 600))

  // Replace with your actual database authentication logic in the future
  if (email === 'saqibbaig110@gmail.com' && password === 'saqibbaig@1100') {
    const cookieStore = await cookies()
    cookieStore.set('stitchbook_auth', 'authenticated', {
      path: '/',
      maxAge: 31536000, // 1 year
    })
  } else {
    return { error: 'Invalid email or password' }
  }

  redirect('/')
}