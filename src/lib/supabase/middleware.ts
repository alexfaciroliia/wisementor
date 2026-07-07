import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Rotas públicas (não precisam de autenticação na camada de proxy)
  const publicRoutes = ['/login', '/cadastro', '/esqueci-senha', '/verificar-email', '/auth', '/completar-cadastro']
  const { pathname } = request.nextUrl
  const isPublic = pathname === '/' || publicRoutes.some((route) => pathname.startsWith(route))

  const { data: { user } } = await supabase.auth.getUser()

  // Se não estiver logado e tentar rota protegida -> Login
  if (!isPublic && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Se já estiver logado e tentar acessar Login ou Esqueci Senha -> Dashboard
  // Nota: /completar-cadastro NÃO é bloqueado aqui pois usuários convidados precisam acessá-lo
  // para definir nome e senha, mesmo já estando autenticados via token do convite.
  if (user && (pathname === '/login' || pathname === '/esqueci-senha')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

