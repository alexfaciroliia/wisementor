'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleRedefinir(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.updateUser({ password })

    if (authError) {
      setError('Ocorreu um erro ao redefinir a senha. O link pode ter expirado.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/login'), 3000)
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
        <h1 className="auth-title">Nova senha</h1>
        <p className="auth-subtitle">Escolha uma nova senha segura para sua conta.</p>
      </div>

      {success ? (
        <div className="alert alert-success" role="alert">
          <span>✅</span>
          <span>Senha redefinida com sucesso! Redirecionando para o login...</span>
        </div>
      ) : (
        <>
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleRedefinir} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="confirm-password">Confirmar nova senha</label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              id="btn-redefinir-senha"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Salvando...
                </>
              ) : (
                'Redefinir senha'
              )}
            </button>
          </form>
        </>
      )}

      <div className="auth-footer">
        <Link href="/login" className="auth-link">
          Voltar para login
        </Link>
      </div>
    </div>
  )
}
