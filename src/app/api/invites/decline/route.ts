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
    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório.' }, { status: 400 })
    }

    const adminClient = getAdminClient()

    // 1. Obter informações do usuário para pegar o e-mail
    const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(userId)
    if (getUserError || !authUser?.user) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    const email = authUser.user.email

    // 2. Atualizar o status do convite para 'revoked'
    if (email) {
      const { error: inviteError } = await adminClient
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('email', email)

      if (inviteError) {
        console.error('Erro ao atualizar convite para recusado:', inviteError)
      }
    }

    // 3. Excluir o perfil da tabela profiles se existir
    await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId)

    // 4. Excluir o usuário do Supabase Auth
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      return NextResponse.json({ error: `Erro ao remover conta: ${deleteError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
