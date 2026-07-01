import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { isOnboardingComplete } from '@/lib/onboarding'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }) },
          remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (nextParam) {
        return NextResponse.redirect(`${origin}${nextParam}`)
      }

      const { data: { user } } = await supabase.auth.getUser()
      const destination = user && (await isOnboardingComplete(supabase, user.id))
        ? '/portfolio'
        : '/onboarding'
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=verification_failed`)
}
