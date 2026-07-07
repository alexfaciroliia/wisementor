'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
  const router = useRouter()
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const supabase = createClient()

    async function handleAuth() {
      // 1. Tentar ler o hash fragment (fluxo implícito do Supabase)
      const hash = window.location.hash
      if (hash) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type = params.get('type')

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (!error) {
            if (type === 'invite' || type === 'signup') {
              router.replace('/completar-cadastro')
              return
            }
            if (type === 'recovery') {
              router.replace('/redefinir-senha')
              return
            }
            // Tipo desconhecido mas sessão válida
            router.replace('/dashboard')
            return
          }
        }
      }

      // 2. Tentar ler query params (fluxo PKCE / token_hash)
      const searchParams = new URLSearchParams(window.location.search)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type') as 'invite' | 'signup' | 'recovery' | 'magiclink' | null

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        })

        if (!error) {
          if (type === 'invite' || type === 'signup') {
            router.replace('/completar-cadastro')
            return
          }
          if (type === 'recovery') {
            router.replace('/redefinir-senha')
            return
          }
          router.replace('/dashboard')
          return
        }
      }

      // 3. Verificar se já existe uma sessão ativa (caso o Supabase client já tenha processado)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/completar-cadastro')
        return
      }

      // Nenhum token encontrado — convite inválido
      router.replace('/auth/convite-invalido')
    }

    handleAuth()
  }, [router])

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
    }}>
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="auth-logo-icon">🎓</div>
          <span className="auth-logo-name">WiseMentor</span>
        </div>
        <div style={{ margin: '2rem 0' }}>
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Verificando seu convite...
        </p>
      </div>
    </div>
  )
}
