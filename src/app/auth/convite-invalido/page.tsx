'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function ConviteInvalidoContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const desc = searchParams.get('desc')

  return (
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

        {(error || desc) && (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: 'rgba(239, 68, 68, 0.08)', 
            border: '1px solid rgba(239, 68, 68, 0.15)', 
            borderRadius: '6px', 
            color: '#ef4444', 
            fontSize: '0.85rem',
            textAlign: 'left',
            wordBreak: 'break-word'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Detalhes do erro:</strong>
            {desc || error}
          </div>
        )}
      </div>

      {/* Ação */}
      <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', marginTop: '1rem' }}>
        Voltar para a Tela de Login
      </Link>
    </div>
  )
}

export default function ConviteInvalidoPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '2rem' }}>
      <Suspense fallback={
        <div className="auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
        </div>
      }>
        <ConviteInvalidoContent />
      </Suspense>
    </div>
  )
}
