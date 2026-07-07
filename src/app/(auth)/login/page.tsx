'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos. Verifique e tente novamente.'
          : authError.message === 'Email not confirmed'
          ? 'Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.'
          : 'Ocorreu um erro ao entrar. Tente novamente.'
      )
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="auth-card">
      {/* Logo */}
      <div className="auth-logo">
        <div className="auth-logo-icon">🎓</div>
        <span className="auth-logo-name">WiseMentor</span>
      </div>

      {/* Cabeçalho */}
      <div className="auth-header">
        <h1 className="auth-title">Bem-vindo!</h1>
        <p className="auth-subtitle">Entre na sua conta para continuar</p>
      </div>

      {/* Alerta de erro */}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Formulário */}
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            className="form-input"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="form-field">
          <div className="field-action">
            <label className="form-label" htmlFor="login-password">Senha</label>
            <Link href="/esqueci-senha" className="field-action-link">
              Esqueceu a senha?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          id="btn-login"
          className="btn-primary"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Entrando...
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>
    </div>
  )
}
