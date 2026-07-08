import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

// ── LISTAR USUÁRIOS (com banned_until do Auth) ──
export async function GET() {
  try {
    const userClient = await getUserClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const callerRole = callerProfile?.role
    if (callerRole !== 'sistema' && callerRole !== 'administrador') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    // Buscar todos os usuários do Auth (inclui banned_until)
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
      perPage: 1000
    })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // Criar mapa de banned_until por user id
    const bannedMap: Record<string, string | null> = {}
    for (const authUser of authData.users) {
      bannedMap[authUser.id] = authUser.banned_until || null
    }

    // Buscar perfis do banco
    let profilesQuery = adminClient
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, created_at')
      .order('full_name', { ascending: true })

    if (callerRole === 'administrador') {
      profilesQuery = profilesQuery.neq('role', 'sistema')
    }

    const { data: profiles, error: profilesError } = await profilesQuery
    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    // Mesclar banned_until do Auth com os perfis
    const usersWithBanStatus = (profiles || []).map(p => ({
      ...p,
      banned_until: bannedMap[p.id] || null
    }))

    return NextResponse.json({ users: usersWithBanStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
