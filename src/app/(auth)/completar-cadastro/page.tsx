'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function CompletarCadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleCompletar(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!nome.trim()) {
      setError('Por favor, informe seu nome.')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // 1. Atualizar nome e senha do usuário convidado
    const { error: authError } = await supabase.auth.updateUser({
      password,
      data: { full_name: nome },
    })

    if (authError) {
      setError('Ocorreu um erro ao concluir seu cadastro. O convite pode ter expirado.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
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
        <h1 className="auth-title">Completar Cadastro</h1>
        <p className="auth-subtitle">Configure sua senha e nome para acessar a plataforma.</p>
      </div>

      {success ? (
        <div className="alert alert-success" role="alert">
          <span>✅</span>
          <span>Cadastro concluído! Acessando a plataforma...</span>
        </div>
      ) : (
        <>
          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleCompletar} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="completar-nome">Nome completo</label>
              <input
                id="completar-nome"
                type="text"
                className="form-input"
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="completar-password">Definir senha</label>
              <input
                id="completar-password"
                type="password"
                className="form-input"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="completar-confirm-password">Confirmar senha</label>
              <input
                id="completar-confirm-password"
                type="password"
                className="form-input"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <span className="form-hint">Use letras, números e símbolos para mais segurança.</span>
            </div>

            <button
              type="submit"
              id="btn-completar"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Salvando dados...
                </>
              ) : (
                'Concluir e Acessar'
              )}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
