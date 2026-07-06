import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Processa o link de redefinição de senha enviado por e-mail pelo Supabase
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type === 'recovery') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash,
    })

    if (!error) {
      // Usuário autenticado temporariamente — redireciona para redefinir senha
      return NextResponse.redirect(`${origin}/redefinir-senha`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=token`)
}
