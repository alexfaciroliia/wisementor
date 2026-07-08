'use client'

import { useDashboard } from './layout'

export default function DashboardPage() {
  const { profile, invitations, allUsers } = useDashboard()

  return (
    <div>
      <div className="content-header">
        <h2 className="content-title">Dashboard</h2>
        <p className="content-subtitle">Visão geral da plataforma WiseMentor</p>
      </div>

      <div className="auth-card" style={{ maxWidth: '100%', padding: '2.5rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
          Olá, {profile?.full_name}! 🎓
        </h3>
        <p style={{ color: '#8b8fa8', lineHeight: 1.6, maxWidth: '700px' }}>
          Seja bem-vindo à página principal do WiseMentor. Este painel foi inteiramente estruturado com uma navegação por menu lateral inteligente e design moderno. 
          <br /><br />
          A partir daqui você terá o controle completo sobre seus usuários e configurações da plataforma.
        </p>
      </div>

      {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
          <div className="auth-card" style={{ maxWidth: '100%', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{allUsers.length}</div>
            <div style={{ color: '#8b8fa8', fontSize: '0.875rem', marginTop: '0.25rem' }}>Usuários Ativos</div>
          </div>
          <div className="auth-card" style={{ maxWidth: '100%', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✉️</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {invitations.filter(i => i.status === 'pending').length}
            </div>
            <div style={{ color: '#8b8fa8', fontSize: '0.875rem', marginTop: '0.25rem' }}>Convites Pendentes</div>
          </div>
          <div className="auth-card" style={{ maxWidth: '100%', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {invitations.filter(i => i.status === 'accepted').length}
            </div>
            <div style={{ color: '#8b8fa8', fontSize: '0.875rem', marginTop: '0.25rem' }}>Convites Aceitos</div>
          </div>
        </div>
      )}
    </div>
  )
}
