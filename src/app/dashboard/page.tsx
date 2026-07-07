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

  // Estados do modal de editar perfil
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editConfirmPassword, setEditConfirmPassword] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)


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

  function openProfileModal() {
    setEditName(profile?.full_name || '')
    setEditPassword('')
    setEditConfirmPassword('')
    setEditError('')
    setEditSuccess('')
    setIsProfileModalOpen(true)
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')
    setEditSuccess('')

    if (!editName.trim()) {
      setEditError('Por favor, digite seu nome.')
      setEditLoading(false)
      return
    }

    const updates: any = {
      data: { full_name: editName }
    }

    if (editPassword) {
      if (editPassword.length < 6) {
        setEditError('A nova senha deve ter pelo menos 6 caracteres.')
        setEditLoading(false)
        return
      }
      if (editPassword !== editConfirmPassword) {
        setEditError('As senhas não coincidem.')
        setEditLoading(false)
        return
      }
      updates.password = editPassword
    }

    // 1. Atualizar no Auth do Supabase
    const { data: { user }, error: authError } = await supabase.auth.updateUser(updates)

    if (authError) {
      setEditError(authError.message)
      setEditLoading(false)
      return
    }

    if (user) {
      // 2. Atualizar tabela de perfis
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ full_name: editName })
        .eq('id', user.id)

      if (dbError) {
        setEditError('Erro ao salvar nome no banco de dados.')
        setEditLoading(false)
        return
      }

      setProfile(prev => prev ? { ...prev, full_name: editName } : null)
      setEditSuccess('Perfil atualizado com sucesso!')
      setTimeout(() => {
        setIsProfileModalOpen(false)
      }, 1500)
    }

    setEditLoading(false)
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
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={openProfileModal} className="btn-secondary" style={{ width: 'auto', padding: '0 1.25rem' }}>
              ⚙️ Editar Perfil
            </button>
            <button onClick={handleLogout} className="btn-primary" style={{ width: 'auto', padding: '0 1.25rem', marginTop: 0, background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
              Sair da conta
            </button>
          </div>
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

      {/* Modal de Editar Perfil */}
      {isProfileModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Editar Perfil</h3>
              <button onClick={() => setIsProfileModalOpen(false)} className="modal-close">
                &times;
              </button>
            </div>

            {editError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠️</span>
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <span>✅</span>
                <span>{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="auth-form" noValidate>
              <div className="form-field">
                <label className="form-label">Nome Completo</label>
                <input
                  type="text"
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Nova Senha (deixe em branco para manter)</label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input form-input-password"
                    placeholder="••••••••"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
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

              {editPassword && (
                <div className="form-field">
                  <label className="form-label">Confirmar Nova Senha</label>
                  <div className="password-input-container">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input form-input-password"
                      placeholder="••••••••"
                      value={editConfirmPassword}
                      onChange={(e) => setEditConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
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
              )}


              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="btn-secondary"
                  disabled={editLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: 0 }}
                  disabled={editLoading}
                >
                  {editLoading ? <span className="spinner" /> : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

