import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Obter perfil de autenticação do usuário logado
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

// Inicializar cliente do usuário a partir dos cookies
async function getUserClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

// ── EXCLUIR USUÁRIO ──
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params
    const userClient = await getUserClient()

    // 1. Verificar autenticação
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // 2. Não pode excluir a si mesmo
    if (user.id === targetUserId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })
    }

    // 3. Verificar permissão do usuário logado
    const profile = await getAuthProfile(userClient, user.id)
    if (!profile || profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // 4. Verificar o papel do usuário alvo
    const { data: targetProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Administrador não pode excluir usuários com papel 'sistema'
    if (profile.role === 'administrador' && targetProfile.role === 'sistema') {
      return NextResponse.json({ error: 'Acesso negado. Administradores não podem gerenciar usuários nível Sistema.' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    // 5. Excluir perfil da tabela profiles
    await adminClient
      .from('profiles')
      .delete()
      .eq('id', targetUserId)

    // 6. Excluir usuário do Supabase Auth
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)
    if (deleteError) {
      return NextResponse.json({ error: `Erro ao excluir usuário: ${deleteError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}

// ── BLOQUEAR / DESBLOQUEAR USUÁRIO ──
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params
    const { action } = await request.json() // 'ban' ou 'unban'

    if (!action || !['ban', 'unban'].includes(action)) {
      return NextResponse.json({ error: 'Ação inválida. Use "ban" ou "unban".' }, { status: 400 })
    }

    const userClient = await getUserClient()

    // 1. Verificar autenticação
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // 2. Não pode bloquear a si mesmo
    if (user.id === targetUserId) {
      return NextResponse.json({ error: 'Você não pode bloquear/desbloquear sua própria conta.' }, { status: 400 })
    }

    // 3. Verificar permissão
    const profile = await getAuthProfile(userClient, user.id)
    if (!profile || profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // 4. Verificar o papel do usuário alvo
    const { data: targetProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Administrador não pode bloquear/desbloquear usuários 'sistema'
    if (profile.role === 'administrador' && targetProfile.role === 'sistema') {
      return NextResponse.json({ error: 'Acesso negado. Administradores não podem gerenciar usuários nível Sistema.' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    if (action === 'ban') {
      const banUntilDate = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() // ~100 anos
      
      // Banir o usuário no Supabase Auth
      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: '876000h' // ~100 anos
      })
      if (error) {
        return NextResponse.json({ error: `Erro ao bloquear usuário no Auth: ${error.message}` }, { status: 500 })
      }

      // Atualizar na tabela profiles
      const { error: dbError } = await adminClient
        .from('profiles')
        .update({ banned_until: banUntilDate })
        .eq('id', targetUserId)

      if (dbError) {
        return NextResponse.json({ error: `Bloqueado no Auth, mas falhou ao atualizar banco: ${dbError.message}` }, { status: 500 })
      }
    } else {
      // Desbanir no Supabase Auth
      const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: 'none'
      })
      if (error) {
        return NextResponse.json({ error: `Erro ao desbloquear usuário no Auth: ${error.message}` }, { status: 500 })
      }

      // Limpar na tabela profiles
      const { error: dbError } = await adminClient
        .from('profiles')
        .update({ banned_until: null })
        .eq('id', targetUserId)

      if (dbError) {
        return NextResponse.json({ error: `Desbloqueado no Auth, mas falhou ao atualizar banco: ${dbError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, action })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}

// ── EDITAR PAPEL DO USUÁRIO ──
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params
    const { role: newRole } = await request.json()

    const allowedRoles = ['sistema', 'administrador', 'operador']
    if (!newRole || !allowedRoles.includes(newRole)) {
      return NextResponse.json({ error: 'Papel (role) inválido.' }, { status: 400 })
    }

    const userClient = await getUserClient()

    // 1. Verificar autenticação
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // 2. Não pode alterar o próprio papel por segurança (evita lockout)
    if (user.id === targetUserId) {
      return NextResponse.json({ error: 'Você não pode alterar seu próprio nível de acesso.' }, { status: 400 })
    }

    // 3. Verificar permissão do usuário logado
    const profile = await getAuthProfile(userClient, user.id)
    if (!profile || profile.role === 'operador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // 4. Verificar o papel do usuário alvo
    const { data: targetProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Validar hierarquia
    if (profile.role === 'administrador') {
      // Admin não pode editar usuário sistema, nem atribuir papel sistema
      if (targetProfile.role === 'sistema' || newRole === 'sistema') {
        return NextResponse.json({ error: 'Acesso negado. Administradores não podem gerenciar ou atribuir nível Sistema.' }, { status: 403 })
      }
    }

    const adminClient = getAdminClient()

    // 5. Atualizar na tabela profiles
    const { error: dbError } = await adminClient
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId)

    if (dbError) {
      return NextResponse.json({ error: `Erro ao atualizar banco: ${dbError.message}` }, { status: 500 })
    }

    // 6. Atualizar nos metadados do Supabase Auth
    const { error: authError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      user_metadata: { role: newRole }
    })

    if (authError) {
      return NextResponse.json({ error: `Erro ao atualizar metadados no Auth: ${authError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, role: newRole })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}

