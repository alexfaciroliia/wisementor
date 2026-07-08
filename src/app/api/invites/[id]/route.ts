import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Obter os detalhes de autenticação do usuário logado
async function getAuthProfile(userClient: any, userId: string) {
  const { data } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data
}

// Inicializar cliente administrativo (Service Role)
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

// ── EXCLUIR CONVITE ──
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()

    // 1. Cliente Supabase do Usuário
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const profile = await getAuthProfile(userClient, user.id)
    if (!profile || profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // 2. Buscar dados do convite para verificar permissões e obter o e-mail
    const { data: invitation, error: fetchError } = await userClient
      .from('invitations')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 })
    }

    // Administrador não pode deletar convites com o papel de 'sistema'
    if (profile.role === 'administrador' && invitation.role === 'sistema') {
      return NextResponse.json({ error: 'Acesso negado. Administradores não podem gerenciar convites nível Sistema.' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    // 3. Remover usuário pendente do Supabase Auth para invalidar o link de e-mail
    const { data: usersData } = await adminClient.auth.admin.listUsers()
    if (usersData?.users) {
      const pendingUser = usersData.users.find(u => u.email === invitation.email)
      if (pendingUser) {
        await adminClient.auth.admin.deleteUser(pendingUser.id)
      }
    }

    // 4. Remover convite da tabela invitations
    const { error: deleteError } = await userClient
      .from('invitations')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: 'Erro ao remover convite do banco.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}

// ── EDITAR E REENVIAR CONVITE ──
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const { email: newEmail, role: newRole, expiresAt: newExpiresAtBody } = await request.json()

    if (!newEmail || !newRole) {
      return NextResponse.json({ error: 'E-mail e papel são obrigatórios.' }, { status: 400 })
    }

    // 1. Cliente Supabase do Usuário
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const profile = await getAuthProfile(userClient, user.id)
    if (!profile || profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // 2. Buscar convite atual para validação
    const { data: invitation, error: fetchError } = await userClient
      .from('invitations')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 })
    }

    // Validar hierarquia
    if (profile.role === 'administrador') {
      if (invitation.role === 'sistema' || newRole === 'sistema') {
        return NextResponse.json({ error: 'Acesso negado. Administradores não podem atribuir ou gerenciar o papel Sistema.' }, { status: 403 })
      }
    }

    const adminClient = getAdminClient()

    // 3. Excluir o usuário pendente anterior de auth.users (invalida link anterior)
    const { data: usersData } = await adminClient.auth.admin.listUsers()
    if (usersData?.users) {
      const oldPending = usersData.users.find(u => u.email === invitation.email)
      if (oldPending) {
        await adminClient.auth.admin.deleteUser(oldPending.id)
      }
      
      // Se o e-mail mudou, garante que o novo e-mail também não tenha uma conta pendente pendurada
      if (invitation.email !== newEmail) {
        const newPending = usersData.users.find(u => u.email === newEmail)
        if (newPending) {
          await adminClient.auth.admin.deleteUser(newPending.id)
        }
      }
    }

    // 4. Atualizar a linha de convite no banco de dados
    const newExpiresAt = newExpiresAtBody || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    let updateError: any = null

    const { error: tryUpdate } = await userClient
      .from('invitations')
      .update({
        email: newEmail,
        role: newRole,
        status: 'pending',
        expires_at: newExpiresAt
      })
      .eq('id', id)

    if (tryUpdate && tryUpdate.message.includes('expires_at')) {
      const { error: fallbackUpdate } = await userClient
        .from('invitations')
        .update({
          email: newEmail,
          role: newRole,
          status: 'pending'
        })
        .eq('id', id)
      updateError = fallbackUpdate
    } else {
      updateError = tryUpdate
    }

    if (updateError) {
      return NextResponse.json({ error: 'Erro ao atualizar dados do convite.' }, { status: 500 })
    }

    // 5. Enviar novo convite de e-mail (cria nova hash e token no Supabase)
    let emailSent = true
    let actionLink = null

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(newEmail, {
      redirectTo: `${new URL(request.url).origin}/auth/confirm`,
      data: {
        role: newRole
      }
    })

    if (inviteError) {
      const errMsg = inviteError.message.toLowerCase()
      if (errMsg.includes('rate limit') || errMsg.includes('limit exceeded') || errMsg.includes('smtp') || errMsg.includes('bad gateway') || errMsg.includes('service unavailable')) {
        // Fallback: Gerar link de convite sem enviar e-mail
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'invite',
          email: newEmail,
          options: {
            redirectTo: `${new URL(request.url).origin}/auth/confirm`,
            data: {
              role: newRole
            }
          }
        })

        if (linkError) {
          return NextResponse.json({ error: `Erro ao gerar link de convite: ${linkError.message}` }, { status: 500 })
        }

        emailSent = false
        actionLink = linkData?.properties?.action_link
      } else {
        return NextResponse.json({ error: `Erro ao disparar convite: ${inviteError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, emailSent, actionLink })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
