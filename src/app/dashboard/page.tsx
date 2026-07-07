'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  full_name: string
  email: string
  role: 'sistema' | 'administrador' | 'operador'
  avatar_url: string
  created_at: string
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
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invites' | 'users' | 'settings'>('dashboard')
  const [loading, setLoading] = useState(true)

  // Estados do formulario de convite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operador')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Estados do modal de editar perfil
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editConfirmPassword, setEditConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')

  // Estados do modal de editar convite
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [editInviteId, setEditInviteId] = useState('')
  const [editInviteEmail, setEditInviteEmail] = useState('')
  const [editInviteRole, setEditInviteRole] = useState('')
  const [editInviteLoading, setEditInviteLoading] = useState(false)
  const [editInviteError, setEditInviteError] = useState('')
  const [editInviteSuccess, setEditInviteSuccess] = useState('')

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
        .select('id, full_name, email, role, avatar_url, created_at')
        .eq('id', user.id)
        .single()

      let loadedProfile: Profile
      if (profileError || !userProfile) {
        loadedProfile = {
          id: user.id,
          full_name: user.user_metadata?.full_name || 'Usuário',
          email: user.email || '',
          role: 'operador',
          avatar_url: user.user_metadata?.avatar_url || '',
          created_at: new Date().toISOString()
        }
      } else {
        loadedProfile = {
          ...(userProfile as Profile),
          email: user.email || (userProfile as Profile).email // Prioriza o e-mail da sessão ativa do Auth
        }
      }
      setProfile(loadedProfile)


      // 3. Obter dados adicionais do banco
      if (loadedProfile.role === 'sistema') {
        // Sistema vê todos os convites e todos os usuários
        const { data: inviteList } = await supabase
          .from('invitations')
          .select('id, email, role, status, created_at')
          .order('created_at', { ascending: false })

        if (inviteList) {
          setInvitations(inviteList as Invitation[])
        }

        const { data: usersList } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, created_at')
          .order('created_at', { ascending: false })

        if (usersList) {
          setAllUsers(usersList as Profile[])
        }
      } else if (loadedProfile.role === 'administrador') {
        // Administrador vê convites e usuários, EXCETO nível 'sistema'
        const { data: inviteList } = await supabase
          .from('invitations')
          .select('id, email, role, status, created_at')
          .neq('role', 'sistema')
          .order('created_at', { ascending: false })

        if (inviteList) {
          setInvitations(inviteList as Invitation[])
        }

        const { data: usersList } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, created_at')
          .neq('role', 'sistema')
          .order('created_at', { ascending: false })

        if (usersList) {
          setAllUsers(usersList as Profile[])
        }
      } else {
        // Operador não tem acesso a gerenciar usuários nem convites
        setInvitations([])
        setAllUsers([])
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

    // Recarregar lista de convites dependendo do papel
    if (profile?.role === 'sistema') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    } else if (profile?.role === 'administrador') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .neq('role', 'sistema')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    }
  }


  function openProfileModal() {
    setEditName(profile?.full_name || '')
    setEditPassword('')
    setEditConfirmPassword('')
    setAvatarFile(null)
    setAvatarPreview(profile?.avatar_url || '')
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

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setEditError('Sessão expirada. Faça login novamente.')
      setEditLoading(false)
      return
    }

    // 1. Upload do Avatar se houver novo arquivo selecionado
    let newAvatarUrl = profile?.avatar_url || ''
    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop()
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile, { upsert: true })

      if (uploadError) {
        setEditError(`Erro no envio da imagem: ${uploadError.message}`)
        setEditLoading(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      newAvatarUrl = publicUrl
      updates.data.avatar_url = publicUrl
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

    // 2. Atualizar no Auth do Supabase
    const { error: authError } = await supabase.auth.updateUser(updates)

    if (authError) {
      setEditError(authError.message)
      setEditLoading(false)
      return
    }

    // 3. Atualizar tabela de perfis
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ 
        full_name: editName,
        avatar_url: newAvatarUrl
      })
      .eq('id', user.id)

    if (dbError) {
      setEditError('Erro ao salvar informações no banco de dados.')
      setEditLoading(false)
      return
    }

    setProfile(prev => prev ? { ...prev, full_name: editName, avatar_url: newAvatarUrl } : null)
    setEditSuccess('Perfil atualizado com sucesso!')
    setTimeout(() => {
      setIsProfileModalOpen(false)
    }, 1500)

    setEditLoading(false)
  }

  async function handleDeleteInvite(id: string) {
    if (!window.confirm('Deseja realmente anular e excluir este convite? O link enviado no e-mail não funcionará mais.')) {
      return
    }

    const response = await fetch(`/api/invites/${id}`, {
      method: 'DELETE'
    })

    const data = await response.json()

    if (!response.ok) {
      alert(data.error || 'Erro ao excluir convite.')
      return
    }

    // Recarregar convites
    if (profile?.role === 'sistema') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    } else if (profile?.role === 'administrador') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .neq('role', 'sistema')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    }
  }

  function openEditInviteModal(inv: Invitation) {
    setEditInviteId(inv.id)
    setEditInviteEmail(inv.email)
    setEditInviteRole(inv.role)
    setEditInviteError('')
    setEditInviteSuccess('')
    setIsInviteModalOpen(true)
  }

  async function handleUpdateInvite(e: React.FormEvent) {
    e.preventDefault()
    setEditInviteLoading(true)
    setEditInviteError('')
    setEditInviteSuccess('')

    const response = await fetch(`/api/invites/${editInviteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: editInviteEmail, role: editInviteRole })
    })

    const data = await response.json()

    if (!response.ok) {
      setEditInviteError(data.error || 'Erro ao atualizar e reenviar convite.')
      setEditInviteLoading(false)
      return
    }

    setEditInviteSuccess('Convite atualizado e enviado com sucesso!')
    
    // Recarregar convites
    if (profile?.role === 'sistema') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    } else if (profile?.role === 'administrador') {
      const { data: inviteList } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at')
        .neq('role', 'sistema')
        .order('created_at', { ascending: false })

      if (inviteList) setInvitations(inviteList as Invitation[])
    }

    setTimeout(() => {
      setIsInviteModalOpen(false)
    }, 1500)

    setEditInviteLoading(false)
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

  // Abreviação de iniciais para avatar
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U'

  return (
    <div className="app-container">
      {/* Menu Lateral (Sidebar) */}
      <aside className="sidebar">
        {/* Perfil no Topo do Menu */}
        <div className="sidebar-profile">
          <div className="profile-info">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt="Avatar" 
                className="profile-avatar" 
                style={{ objectFit: 'cover' }} 
              />
            ) : (
              <div className="profile-avatar">{initials}</div>
            )}
            <div className="profile-details">
              <span className="profile-name" title={profile?.full_name}>{profile?.full_name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={profile?.email}>
                {profile?.email}
              </span>
              <span className="profile-role-badge" style={{ marginTop: '0.25rem' }}>{profile?.role}</span>
            </div>
          </div>
          <div className="profile-actions">
            <button onClick={openProfileModal} className="profile-action-btn" title="Editar Perfil">
              ⚙️ Editar
            </button>
            <button onClick={handleLogout} className="profile-action-btn" title="Sair da Conta">
              🚪 Sair
            </button>
          </div>
        </div>

        {/* Links do Menu */}
        <nav className="sidebar-menu">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            📊 Dashboard
          </button>
          
          {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
            <button
              onClick={() => setActiveTab('invites')}
              className={`menu-item ${activeTab === 'invites' ? 'active' : ''}`}
            >
              ✉️ Convites
            </button>
          )}

          {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
            <button
              onClick={() => setActiveTab('users')}
              className={`menu-item ${activeTab === 'users' ? 'active' : ''}`}
            >
              👥 Usuários
            </button>
          )}

          <button
            onClick={() => setActiveTab('settings')}
            className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`}
          >
            🛠️ Configurações
          </button>
        </nav>
      </aside>

      {/* Conteúdo Principal (Direita) */}
      <main className="main-content">
        {/* Aba: Dashboard */}
        {activeTab === 'dashboard' && (
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
        )}



        {/* Aba: Convites (Apenas Administrador e Sistema) */}
        {activeTab === 'invites' && (profile?.role === 'sistema' || profile?.role === 'administrador') && (
          <div>
            <div className="content-header">
              <h2 className="content-title">Gestão de Convites</h2>
              <p className="content-subtitle">Convide novos membros e gerencie acessos</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
              {/* Formulario */}
              <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem', height: 'fit-content' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Convidar Usuário</h3>
                
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
                      <option value="administrador">Administrador</option>
                      <option value="operador">Operador</option>
                      {profile?.role === 'sistema' && (
                        <option value="sistema">Sistema</option>
                      )}
                    </select>
                  </div>


                  <button type="submit" className="btn-primary" disabled={inviteLoading}>
                    {inviteLoading ? <span className="spinner" /> : 'Enviar Convite'}
                  </button>
                </form>
              </div>


              {/* Lista */}
              <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Histórico de Convites</h3>
                {invitations.length === 0 ? (
                  <p style={{ color: '#8b8fa8', fontSize: '0.9rem' }}>Nenhum convite enviado até o momento.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {invitations.map((inv) => (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{inv.email}</div>
                          <div style={{ fontSize: '0.78rem', color: '#8b8fa8', marginTop: '0.125rem' }}>
                            Papel: <strong>{inv.role}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {inv.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                              <button 
                                onClick={() => openEditInviteModal(inv)}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0 }}
                                title="Editar e Reenviar"
                              >
                                ✏️
                              </button>
                              <button 
                                onClick={() => handleDeleteInvite(inv.id)}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0, borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                                title="Anular e Excluir"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                          <span className={`alert alert-${inv.status === 'accepted' ? 'success' : 'error'}`} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', margin: 0 }}>
                            {inv.status === 'accepted' ? 'Aceito' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Aba: Usuários */}
        {activeTab === 'users' && (
          <div>
            <div className="content-header">
              <h2 className="content-title">Usuários Cadastrados</h2>
              <p className="content-subtitle">Membros registrados na plataforma</p>
            </div>

            <div className="user-table-card">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Acesso</th>
                    <th>Data de Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((u) => {
                    const uInitials = u.full_name
                      ? u.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                      : 'U';
                    return (
                      <tr key={u.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600 }}>
                          {u.avatar_url ? (
                            <img 
                              src={u.avatar_url} 
                              alt="Avatar" 
                              style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} 
                            />
                          ) : (
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.15))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                              {uInitials}
                            </div>
                          )}
                          {u.full_name || 'Usuário Sem Nome'}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <span className="profile-role-badge" style={{ display: 'inline-block' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ color: '#8b8fa8' }}>
                          {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* Aba: Configurações */}
        {activeTab === 'settings' && (
          <div>
            <div className="content-header">
              <h2 className="content-title">Configurações</h2>
              <p className="content-subtitle">Ajustes gerais do sistema WiseMentor</p>
            </div>

            <div className="auth-card" style={{ maxWidth: '100%', padding: '2.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gerais</h4>
                  <p style={{ color: '#8b8fa8', fontSize: '0.875rem' }}>Ajustes e dados gerais da plataforma de mentoria.</p>
                </div>
                
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
                
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Políticas de Convites</h4>
                  <p style={{ color: '#8b8fa8', fontSize: '0.875rem', marginBottom: '1rem' }}>Atualmente configurado como privado (Apenas Master pode convidar).</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

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
              {/* Foto de Perfil (Avatar) */}
              <div className="form-field" style={{ alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  {avatarPreview ? (
                    <img 
                      src={avatarPreview} 
                      alt="Preview" 
                      style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }} 
                    />
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.15))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                      {initials}
                    </div>
                  )}
                  <label 
                    htmlFor="avatar-upload" 
                    className="btn-secondary" 
                    style={{ width: 'auto', height: '2rem', padding: '0 0.875rem', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    📷 Escolher Foto
                  </label>
                  <input 
                    id="avatar-upload"
                    type="file" 
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </div>
              </div>

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

      {/* Modal de Editar Convite */}
      {isInviteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Editar e Reenviar Convite</h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="modal-close">
                &times;
              </button>
            </div>

            {editInviteError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠️</span>
                <span>{editInviteError}</span>
              </div>
            )}

            {editInviteSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <span>✅</span>
                <span>{editInviteSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateInvite} className="auth-form" noValidate>
              <div className="form-field">
                <label className="form-label">E-mail do Convidado</label>
                <input
                  type="email"
                  className="form-input"
                  value={editInviteEmail}
                  onChange={(e) => setEditInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Nível de Acesso (Papel)</label>
                <select
                  value={editInviteRole}
                  onChange={(e) => setEditInviteRole(e.target.value)}
                  className="form-input"
                  style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                >
                  <option value="administrador">Administrador</option>
                  <option value="operador">Operador</option>
                  {profile?.role === 'sistema' && (
                    <option value="sistema">Sistema</option>
                  )}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="btn-secondary"
                  disabled={editInviteLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: 0 }}
                  disabled={editInviteLoading}
                >
                  {editInviteLoading ? <span className="spinner" /> : 'Salvar e Reenviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

