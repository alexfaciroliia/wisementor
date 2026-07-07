'use client'

import Link from 'next/link'

export default function ConviteInvalidoPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '2rem' }}>
      <div className="auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        {/* Logo */}
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="auth-logo-icon">🎓</div>
          <span className="auth-logo-name">WiseMentor</span>
        </div>

        {/* Ícone de Alerta */}
        <div style={{ fontSize: '3.5rem', margin: '1.5rem 0 1rem 0' }}>⚠️</div>

        {/* Cabeçalho */}
        <div className="auth-header" style={{ marginBottom: '2rem' }}>
          <h1 className="auth-title" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Convite Inválido ou Expirado
          </h1>
          <p className="auth-subtitle" style={{ fontSize: '0.9375rem', lineHeight: '1.6', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            Este link de convite não é mais válido. Ele pode ter sido utilizado, expirado após o tempo limite ou cancelado pelo administrador do sistema.
          </p>
        </div>

        {/* Ação */}
        <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', marginTop: '1rem' }}>
          Voltar para a Tela de Login
        </Link>
      </div>
    </div>
  )
}
