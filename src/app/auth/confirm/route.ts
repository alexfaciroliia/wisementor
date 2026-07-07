import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/redefinir-senha`)
      }
      if (type === 'invite' || type === 'signup') {
        return NextResponse.redirect(`${origin}/completar-cadastro`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/convite-invalido`)
}


