import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { email, role, expiresAt: customExpiresAt } = await request.json()

    if (!email || !role) {
      return NextResponse.json({ error: 'E-mail e papel são obrigatórios.' }, { status: 400 })
    }

    // 1. Criar um cliente Supabase com a sessão atual do usuário para verificar permissão
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}, // Leitura apenas
        },
      }
    )

    // Validar se o usuário atual está autenticado
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 })
    }

    // 1. Operador não pode enviar nenhum convite
    if (profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado. Operadores não podem enviar convites.' }, { status: 403 })
    }

    // 2. Validar o papel do convite
    const allowedRolesForInvite = ['sistema', 'administrador', 'operador']
    if (!allowedRolesForInvite.includes(role)) {
      return NextResponse.json({ error: 'Papel do convite inválido.' }, { status: 400 })
    }

    // 3. Administrador não pode convidar usuário nível 'sistema'
    if (profile.role === 'administrador' && role === 'sistema') {
      return NextResponse.json({
        error: 'Acesso negado. Usuários administradores não podem convidar nível Sistema.'
      }, { status: 403 })
    }



    // 2. Criar cliente com SERVICE_ROLE para realizar ações administrativas
    const adminClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Usamos anon_key mas o cookieStore/Headers para o Auth, no entanto, para ações de admin precisamos inicializar com a service_role_key no cabeçalho ou usar a biblioteca diretamente
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )

    // Criamos o adminClient real com a service_role_key
    const supabaseAdmin = createServerClient(
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

    // 3. Salvar o convite na tabela de convites
    const expiresAt = customExpiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    let dbError: any = null

    // Tentar inserir com expires_at; se a coluna não existir, tenta sem
    const { error: insertError } = await userClient
      .from('invitations')
      .insert({
        email,
        role,
        invited_by: user.id,
        status: 'pending',
        expires_at: expiresAt
      })

    if (insertError && insertError.message.includes('expires_at')) {
      // Coluna expires_at ainda não existe — inserir sem ela
      const { error: fallbackError } = await userClient
        .from('invitations')
        .insert({
          email,
          role,
          invited_by: user.id,
          status: 'pending'
        })
      dbError = fallbackError
    } else {
      dbError = insertError
    }

    if (dbError) {
      if (dbError.message.includes('unique constraint')) {
        return NextResponse.json({ error: 'Este e-mail já possui um convite pendente ou ativo.' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Erro ao registrar convite no banco de dados.' }, { status: 500 })
    }

    // 4. Disparar o convite de autenticação do Supabase (envia o e-mail de convite oficial)
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${new URL(request.url).origin}/auth/confirm`,
      data: {
        role: role
      }
    })

    if (inviteError) {
      // Reverter inserção no banco se falhar
      await userClient.from('invitations').delete().eq('email', email)
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno do servidor.' }, { status: 500 })
  }
}
