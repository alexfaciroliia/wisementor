'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      const msg = authError.message.toLowerCase()
      setError(
        msg.includes('invalid login credentials')
          ? 'E-mail ou senha incorretos. Verifique e tente novamente.'
          : msg.includes('email not confirmed')
          ? 'Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.'
          : msg.includes('user banned') || msg.includes('banned')
          ? 'Usuário bloqueado. Contate o administrador do sistema.'
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
          <div className="password-input-container">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="form-input form-input-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.815 7.815 3 3m-3-3-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.43 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              )}
            </button>
          </div>
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
