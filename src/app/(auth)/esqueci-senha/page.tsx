'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function EsqueciSenhaPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?type=recovery`,
    })

    if (authError) {
      setError('Ocorreu um erro ao solicitar o envio. Verifique o e-mail digitado ou tente novamente em alguns minutos.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode.trim() || !email.trim()) {
      setError('Informe o código de verificação de 6 a 8 dígitos.')
      return
    }

    setVerifyingOtp(true)
    setError('')

    const supabase = createClient()
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: 'recovery'
    })

    if (otpError) {
      setError('Código inválido ou expirado. Verifique os números recebidos ou solicite um novo envio.')
      setVerifyingOtp(false)
      return
    }

    // Código validado com sucesso — redirecionar para a tela de nova senha
    router.push('/redefinir-senha')
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
          {success
            ? 'Enviamos as instruções para o seu e-mail. Você pode clicar no link do e-mail ou digitar o código abaixo.'
            : 'Digite seu e-mail e enviaremos um link e código para redefinir sua senha.'}
        </p>
      </div>

      {/* Alerta de erro */}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Etapa 2: Sucesso no envio + Campo de Código OTP */}
      {success ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="alert alert-success" role="alert">
            <span>✅</span>
            <div>
              <strong>Solicitação realizada!</strong>
              <div style={{ fontSize: '0.85rem', marginTop: '0.35rem', lineHeight: '1.4' }}>
                Verifique sua caixa de entrada e a <strong>pasta de Spam / Lixo Eletrônico</strong> do e-mail <strong style={{ color: '#fff' }}>{email}</strong>.
              </div>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleVerifyOtp} noValidate>
            <div className="form-field">
              <label className="form-label" htmlFor="otp-code">
                Código de Verificação (6 a 8 dígitos)
              </label>
              <input
                id="otp-code"
                type="text"
                className="form-input"
                placeholder="Ex: 123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                required
                autoFocus
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '3px', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                Digite o código numérico recebido por e-mail ou fornecido pelo administrador.
              </span>
            </div>

            <button
              type="submit"
              id="btn-validar-codigo"
              className="btn-primary"
              disabled={verifyingOtp || !otpCode.trim()}
            >
              {verifyingOtp ? (
                <>
                  <span className="spinner" />
                  Validando código...
                </>
              ) : (
                '🔑 Validar Código & Criar Nova Senha'
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => { setSuccess(false); setOtpCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Não recebeu? Tentar com outro e-mail
            </button>
          </div>
        </div>
      ) : (
        /* Etapa 1: Formulário Inicial de E-mail */
        <form className="auth-form" onSubmit={handleReset} noValidate>
          <div className="form-field">
            <label className="form-label" htmlFor="reset-email">E-mail cadastrado</label>
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
            disabled={loading || !email.trim()}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Enviando instruções...
              </>
            ) : (
              'Enviar instruções de recuperação'
            )}
          </button>
        </form>
      )}

      {/* Rodapé */}
      <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
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
