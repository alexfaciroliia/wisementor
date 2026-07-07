'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  full_name: string
  email: string
  role: 'master' | 'mentor' | 'mentee' | 'user'
}

interface Invitation {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)

  // Estados do formulario de convite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('mentor')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      // 1. Obter usuario logado
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // 2. Obter perfil do banco
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', user.id)
        .single()

      if (profileError || !userProfile) {
        setProfile({
          full_name: user.user_metadata?.full_name || 'Usuario',
          email: user.email || '',
          role: 'user'
        })
      } else {
        setProfile(userProfile as Profile)
      }

      // 3. Obter convites se for 'master'
      if (userProfile?.role === 'master') {
        const { data: inviteList } = await supabase
          .from('invitations')
          .select('id, email, role, status, created_at')
          .order('created_at', { ascending: false })

        if (inviteList) {
          setInvitations(inviteList as Invitation[])
        }
      }

      setLoading(false)
    }

    loadData()
  }, [router, supabase])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteError('')
    setInviteSuccess('')

    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })

    const data = await response.json()

    if (!response.ok) {
      setInviteError(data.error || 'Erro ao enviar o convite.')
      setInviteLoading(false)
      return
    }

    setInviteSuccess(`Convite enviado com sucesso para ${inviteEmail}!`)
    setInviteEmail('')
    setInviteLoading(false)

    // Recarregar lista de convites
    const { data: inviteList } = await supabase
      .from('invitations')
      .select('id, email, role, status, created_at')
      .order('created_at', { ascending: false })

    if (inviteList) {
      setInvitations(inviteList as Invitation[])
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0f14' }}>
        <span className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14', padding: '2rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header do Dashboard */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontWeight: 700, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>WiseMentor</h1>
            <p style={{ color: '#8b8fa8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Olá, <strong>{profile?.full_name}</strong> (papel: <em>{profile?.role}</em>)
            </p>
          </div>
          <button onClick={handleLogout} className="btn-primary" style={{ width: 'auto', padding: '0 1.25rem', marginTop: 0, background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
            Sair da conta
          </button>
        </header>

        {profile?.role === 'master' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Formulario de Novo Convite */}
            <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem', height: 'fit-content' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Convidar Novo Usuário</h2>
              
              {inviteError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  <span>⚠️</span>
                  <span>{inviteError}</span>
                </div>
              )}

              {inviteSuccess && (
                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                  <span>✅</span>
                  <span>{inviteSuccess}</span>
                </div>
              )}

              <form onSubmit={handleInvite} className="auth-form" noValidate>
                <div className="form-field">
                  <label className="form-label">E-mail do Convidado</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="exemplo@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Nível de Acesso (Papel)</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="form-input"
                    style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                  >
                    <option value="mentor">Mentor</option>
                    <option value="mentee">Mentee (Mentorado)</option>
                    <option value="user">Usuário Comum</option>
                  </select>
                </div>

                <button type="submit" className="btn-primary" disabled={inviteLoading}>
                  {inviteLoading ? <span className="spinner" /> : 'Enviar Convite por E-mail'}
                </button>
              </form>
            </div>

            {/* Lista de Convites */}
            <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Lista de Convites</h2>
              {invitations.length === 0 ? (
                <p style={{ color: '#8b8fa8', fontSize: '0.9rem' }}>Nenhum convite enviado até o momento.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                  {invitations.map((inv) => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{inv.email}</div>
                        <div style={{ fontSize: '0.78rem', color: '#8b8fa8', marginTop: '0.125rem' }}>
                          Papel: <strong>{inv.role}</strong>
                        </div>
                      </div>
                      <span className={`alert alert-${inv.status === 'accepted' ? 'success' : 'error'}`} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none' }}>
                        {inv.status === 'accepted' ? 'Aceito' : 'Pendente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Tela simples para Mentores e Mentees */
          <div className="auth-card" style={{ maxWidth: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="verify-icon">🌟</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>Área do {profile?.role === 'mentor' ? 'Mentor' : 'Mentorado'}</h2>
            <p style={{ color: '#8b8fa8', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
              Seja bem-vindo ao WiseMentor. O seu cadastro foi concluído com sucesso e você já está autenticado na plataforma.
              <br /><br />
              Estamos preparando a sua área de mentoria. Em breve você terá acesso a mais recursos aqui!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
