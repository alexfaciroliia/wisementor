import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  )
}

export async function POST(request: Request) {
  try {
    const { userId, nome } = await request.json()
    if (!userId || !nome) {
      return NextResponse.json({ error: 'ID do usuário e nome são obrigatórios.' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // 1. Obter e-mail do usuário do Auth
    const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
    if (getUserError || !authUser?.user) {
      return NextResponse.json({ error: 'Usuário não encontrado no Auth.' }, { status: 404 })
    }

    const email = authUser.user.email

    // 2. Atualizar perfil com o nome completo
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ full_name: nome })
      .eq('id', userId)

    if (profileError) {
      return NextResponse.json({ error: `Erro ao salvar nome no perfil: ${profileError.message}` }, { status: 500 })
    }

    // 3. Atualizar status do convite para 'accepted'
    if (email) {
      const { error: inviteError } = await adminClient
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('email', email)

      if (inviteError) {
        console.error('Erro ao atualizar convite para aceito:', inviteError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
