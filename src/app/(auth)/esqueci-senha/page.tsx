'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/confirm`,
    })

    if (authError) {
      setError('Ocorreu um erro ao enviar o e-mail. Tente novamente.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
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
        <h1 className="auth-title">Esqueceu a senha?</h1>
        <p className="auth-subtitle">
          Digite seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      {/* Sucesso */}
      {success ? (
        <div className="alert alert-success" role="alert">
          <span>✅</span>
          <span>
            E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir sua senha.
          </span>
        </div>
      ) : (
        <>
          {/* Alerta de erro */}
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Formulário */}
          <form className="auth-form" onSubmit={handleReset} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="reset-email">E-mail</label>
              <input
                id="reset-email"
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

            <button
              type="submit"
              id="btn-reset-senha"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Enviando...
                </>
              ) : (
                'Enviar link de redefinição'
              )}
            </button>
          </form>
        </>
      )}

      {/* Rodapé */}
      <div className="auth-footer">
        <span>
          Lembrou a senha?{' '}
          <Link href="/login" className="auth-link">
            Voltar para login
          </Link>
        </span>
      </div>
    </div>
  )
}
