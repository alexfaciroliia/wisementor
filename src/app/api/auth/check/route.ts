import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return [] }, setAll() {} },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  )
}

async function getUserClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

// Verifica se o usuário atual está ativo ou bloqueado
export async function GET() {
  try {
    const userClient = await getUserClient()
    const { data: { user } } = await userClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ valid: false, banned: false })
    }

    const adminClient = getAdminClient()
    const { data: authUser, error } = await adminClient.auth.admin.getUserById(user.id)

    if (error || !authUser?.user) {
      return NextResponse.json({ valid: false, banned: false })
    }

    const bannedUntil = authUser.user.banned_until
    const isBanned = !!bannedUntil && new Date(bannedUntil) > new Date()

    return NextResponse.json({ valid: true, banned: isBanned })
  } catch {
    return NextResponse.json({ valid: false, banned: false })
  }
}
