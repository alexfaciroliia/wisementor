'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nome },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(
        authError.message.includes('already registered')
          ? 'Este e-mail já está cadastrado. Tente fazer login.'
          : 'Ocorreu um erro ao criar a conta. Tente novamente.'
      )
      setLoading(false)
      return
    }

    router.push('/verificar-email')
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
        <h1 className="auth-title">Criar conta</h1>
        <p className="auth-subtitle">Comece sua jornada de mentoria hoje</p>
      </div>

      {/* Alerta de erro */}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Formulário */}
      <form className="auth-form" onSubmit={handleCadastro} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="cadastro-nome">Nome completo</label>
          <input
            id="cadastro-nome"
            type="text"
            className="form-input"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            autoComplete="name"
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="cadastro-email">E-mail</label>
          <input
            id="cadastro-email"
            type="email"
            className="form-input"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="cadastro-password">Senha</label>
          <input
            id="cadastro-password"
            type="password"
            className="form-input"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={6}
          />
          <span className="form-hint">Use letras, números e símbolos para mais segurança.</span>
        </div>

        <button
          type="submit"
          id="btn-cadastro"
          className="btn-primary"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Criando conta...
            </>
          ) : (
            'Criar conta grátis'
          )}
        </button>
      </form>

      {/* Rodapé */}
      <div className="auth-footer">
        <span>
          Já tem uma conta?{' '}
          <Link href="/login" className="auth-link">
            Entrar
          </Link>
        </span>
      </div>
    </div>
  )
}
