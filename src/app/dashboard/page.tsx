'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  full_name: string
  email: string
  role: 'sistema' | 'administrador' | 'operador'
  avatar_url: string
  created_at: string
  banned_until?: string | null
}


interface Invitation {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
  expires_at?: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const inviteEmailInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invites' | 'users' | 'settings'>('dashboard')

  // Sincronizar aba com parâmetro URL na montagem do componente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    const validTabs = ['dashboard', 'invites', 'users', 'settings']
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam as any)
    }
  }, [])

  function changeTab(tab: 'dashboard' | 'invites' | 'users' | 'settings') {
    setActiveTab(tab)
    const params = new URLSearchParams(window.location.search)
    if (tab === 'dashboard') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const newSearch = params.toString()
    const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`
    window.history.replaceState(null, '', newUrl)
  }

  const [loading, setLoading] = useState(true)

  // Estados do formulario de convite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('operador')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Estados do modal de confirmação / expiração customizada do convite
  const [isInviteConfirmModalOpen, setIsInviteConfirmModalOpen] = useState(false)
  const [inviteExpirationChoice, setInviteExpirationChoice] = useState<'24' | '48' | '72' | '168' | 'custom'>('48')
  const [inviteExpirationCustomDate, setInviteExpirationCustomDate] = useState('')

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
  const [editInviteExpirationChoice, setEditInviteExpirationChoice] = useState<'24' | '48' | '72' | '168' | 'custom'>('48')
  const [editInviteExpirationCustomDate, setEditInviteExpirationCustomDate] = useState('')

  // Estados do modal de confirmação moderna
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [inviteIdToDelete, setInviteIdToDelete] = useState<string | null>(null)

  // Estados para gerenciamento de usuários
  const [isUserConfirmModalOpen, setIsUserConfirmModalOpen] = useState(false)
  const [userActionTarget, setUserActionTarget] = useState<{ id: string; name: string; action: 'delete' | 'ban' | 'unban' } | null>(null)
  const [userActionLoading, setUserActionLoading] = useState(false)

  // Estados do modal de editar papel do usuário
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false)
  const [editUserId, setEditUserId] = useState('')
  const [editUserEmail, setEditUserEmail] = useState('')
  const [editUserName, setEditUserName] = useState('')
  const [editUserRole, setEditUserRole] = useState('')
  const [editUserLoading, setEditUserLoading] = useState(false)
  const [editUserError, setEditUserError] = useState('')
  const [editUserSuccess, setEditUserSuccess] = useState('')

  // Estados do modal de confirmação de reenvio de convite
  const [isResendConfirmModalOpen, setIsResendConfirmModalOpen] = useState(false)
  const [inviteToResend, setInviteToResend] = useState<Invitation | null>(null)


  const supabase = createClient()

  // Helper: calcular status efetivo do convite
  function getInviteDisplayStatus(inv: Invitation): 'accepted' | 'pending' | 'expired' {
    if (inv.status === 'accepted') return 'accepted'
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return 'expired'
    return 'pending'
  }

  // Helper: tempo relativo para expiração
  function getExpirationText(expiresAt: string | null | undefined): string {
    if (!expiresAt) return ''
    const now = new Date()
    const expires = new Date(expiresAt)
    const diffMs = expires.getTime() - now.getTime()

    if (diffMs <= 0) {
      // Expirado
      const agoMs = Math.abs(diffMs)
      const agoHours = Math.floor(agoMs / (1000 * 60 * 60))
      if (agoHours < 1) return 'Expirado há poucos minutos'
      if (agoHours < 24) return `Expirado há ${agoHours}h`
      const agoDays = Math.floor(agoHours / 24)
      return `Expirado há ${agoDays} dia${agoDays > 1 ? 's' : ''}`
    }

    // Ainda válido
    const remainHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (remainHours < 1) return 'Expira em breve'
    if (remainHours < 24) return `Expira em ${remainHours}h`
    const remainDays = Math.floor(remainHours / 24)
    return `Expira em ${remainDays} dia${remainDays > 1 ? 's' : ''}`
  }

  // Buscar convites de forma resiliente (funciona com ou sem a coluna expires_at no banco de dados)
  async function reloadInvitations(userRole: string) {
    if (userRole !== 'sistema' && userRole !== 'administrador') {
      setInvitations([])
      return
    }

    const query = supabase.from('invitations')
    const selectWithExpires = 'id, email, role, status, created_at, expires_at'
    const selectWithoutExpires = 'id, email, role, status, created_at'

    let inviteQuery = query.select(selectWithExpires)
    if (userRole === 'administrador') {
      inviteQuery = inviteQuery.neq('role', 'sistema')
    }
    const { data, error } = await inviteQuery.order('created_at', { ascending: false })

    if (error && error.message.includes('expires_at')) {
      let fallbackQuery = query.select(selectWithoutExpires)
      if (userRole === 'administrador') {
        fallbackQuery = fallbackQuery.neq('role', 'sistema')
      }
      const { data: fallbackData } = await fallbackQuery.order('created_at', { ascending: false })
      if (fallbackData) {
        setInvitations(fallbackData as Invitation[])
      }
    } else if (data) {
      setInvitations(data as Invitation[])
    }
  }

  // Dar foco automático no campo de e-mail ao abrir a aba de convites
  useEffect(() => {
    if (activeTab === 'invites') {
      setTimeout(() => {
        inviteEmailInputRef.current?.focus()
      }, 50)
    }
  }, [activeTab])



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
        await reloadInvitations(loadedProfile.role)

        const { data: usersList } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, created_at')
          .order('full_name', { ascending: true })

        if (usersList) {
          setAllUsers(usersList as Profile[])
        }
      } else if (loadedProfile.role === 'administrador') {
        // Administrador vê convites e usuários, EXCETO nível 'sistema'
        await reloadInvitations(loadedProfile.role)

        const { data: usersList } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url, created_at')
          .neq('role', 'sistema')
          .order('full_name', { ascending: true })

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

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')

    if (!inviteEmail) {
      setInviteError('Por favor, informe o e-mail do convidado.')
      return
    }

    const defaultDate = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const tzoffset = defaultDate.getTimezoneOffset() * 60000
    const localISOTime = new Date(defaultDate.getTime() - tzoffset).toISOString().slice(0, 16)
    
    setInviteExpirationChoice('48')
    setInviteExpirationCustomDate(localISOTime)
    setIsInviteConfirmModalOpen(true)
  }

  async function confirmSendInvite() {
    setInviteLoading(true)
    setInviteError('')
    setInviteSuccess('')

    let expiresAtISO: string | null = null

    if (inviteExpirationChoice === 'custom') {
      if (!inviteExpirationCustomDate) {
        setInviteError('Por favor, defina a data de expiração personalizada.')
        setInviteLoading(false)
        return
      }
      expiresAtISO = new Date(inviteExpirationCustomDate).toISOString()
    } else {
      const hours = parseInt(inviteExpirationChoice, 10)
      expiresAtISO = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    }

    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole, expiresAt: expiresAtISO }),
    })

    const data = await response.json()

    if (!response.ok) {
      setInviteError(data.error || 'Erro ao enviar o convite.')
      setInviteLoading(false)
      setIsInviteConfirmModalOpen(false)
      return
    }

    const expDateFormatted = new Date(expiresAtISO).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    setInviteSuccess(`Convite enviado com sucesso para ${inviteEmail}! Válido até ${expDateFormatted}.`)
    setInviteEmail('')
    setInviteLoading(false)
    setIsInviteConfirmModalOpen(false)

    // Recarregar lista de convites dependendo do papel
    if (profile?.role) {
      await reloadInvitations(profile.role)
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

  function handleDeleteInvite(id: string) {
    setInviteIdToDelete(id)
    setIsConfirmModalOpen(true)
  }

  async function confirmDeleteInvite() {
    if (!inviteIdToDelete) return

    const response = await fetch(`/api/invites/${inviteIdToDelete}`, {
      method: 'DELETE'
    })

    const data = await response.json()

    if (!response.ok) {
      alert(data.error || 'Erro ao excluir convite.')
      setIsConfirmModalOpen(false)
      setInviteIdToDelete(null)
      return
    }

    // Recarregar convites
    if (profile?.role) {
      await reloadInvitations(profile.role)
    }

    setIsConfirmModalOpen(false)
    setInviteIdToDelete(null)
  }


  function openEditInviteModal(inv: Invitation) {
    setEditInviteId(inv.id)
    setEditInviteEmail(inv.email)
    setEditInviteRole(inv.role)
    setEditInviteError('')
    setEditInviteSuccess('')

    const defaultDate = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const tzoffset = defaultDate.getTimezoneOffset() * 60000
    const localISOTime = new Date(defaultDate.getTime() - tzoffset).toISOString().slice(0, 16)
    setEditInviteExpirationChoice('48')
    setEditInviteExpirationCustomDate(localISOTime)

    setIsInviteModalOpen(true)
  }

  async function handleUpdateInvite(e: React.FormEvent) {
    e.preventDefault()
    setEditInviteLoading(true)
    setEditInviteError('')
    setEditInviteSuccess('')

    let expiresAtISO: string | null = null

    if (editInviteExpirationChoice === 'custom') {
      if (!editInviteExpirationCustomDate) {
        setEditInviteError('Por favor, defina a data de expiração personalizada.')
        setEditInviteLoading(false)
        return
      }
      expiresAtISO = new Date(editInviteExpirationCustomDate).toISOString()
    } else {
      const hours = parseInt(editInviteExpirationChoice, 10)
      expiresAtISO = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    }

    const response = await fetch(`/api/invites/${editInviteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: editInviteEmail, role: editInviteRole, expiresAt: expiresAtISO })
    })

    const data = await response.json()

    if (!response.ok) {
      setEditInviteError(data.error || 'Erro ao atualizar e reenviar convite.')
      setEditInviteLoading(false)
      return
    }

    setEditInviteSuccess('Convite atualizado e enviado com sucesso!')
    
    // Recarregar convites
    if (profile?.role) {
      await reloadInvitations(profile.role)
    }

    setTimeout(() => {
      setIsInviteModalOpen(false)
    }, 1500)

    setEditInviteLoading(false)
  }

  // ── Ações de Reenvio Rápido de Convite ──
  function openQuickResendConfirm(inv: Invitation) {
    setInviteToResend(inv)
    setEditInviteError('')
    setEditInviteSuccess('')
    setIsResendConfirmModalOpen(true)
  }

  async function confirmQuickResendInvite() {
    if (!inviteToResend) return
    setEditInviteLoading(true)
    setEditInviteError('')
    setEditInviteSuccess('')

    try {
      const response = await fetch(`/api/invites/${inviteToResend.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteToResend.email, role: inviteToResend.role })
      })

      const data = await response.json()

      if (!response.ok) {
        setEditInviteError(data.error || 'Erro ao reenviar convite.')
        setEditInviteLoading(false)
        return
      }

      setEditInviteSuccess('Convite reenviado com sucesso! Link anterior anulado.')
      
      if (profile?.role) {
        await reloadInvitations(profile.role)
      }

      setTimeout(() => {
        setIsResendConfirmModalOpen(false)
        setInviteToResend(null)
        setEditInviteError('')
        setEditInviteSuccess('')
      }, 1500)
    } catch {
      setEditInviteError('Erro de conexão ao reenviar convite.')
    } finally {
      setEditInviteLoading(false)
    }
  }

  // ── Ações de Gerenciamento de Usuários ──
  function openUserAction(userId: string, userName: string, action: 'delete' | 'ban' | 'unban') {
    setUserActionTarget({ id: userId, name: userName, action })
    setIsUserConfirmModalOpen(true)
  }

  async function reloadUsers() {
    if (profile?.role === 'sistema') {
      const { data: usersList } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, created_at')
        .order('full_name', { ascending: true })
      if (usersList) setAllUsers(usersList as Profile[])
    } else if (profile?.role === 'administrador') {
      const { data: usersList } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, created_at')
        .order('full_name', { ascending: true })
        .neq('role', 'sistema')
      if (usersList) setAllUsers(usersList as Profile[])
    }
  }

  async function confirmUserAction() {
    if (!userActionTarget) return
    setUserActionLoading(true)

    try {
      if (userActionTarget.action === 'delete') {
        const response = await fetch(`/api/users/${userActionTarget.id}`, { method: 'DELETE' })
        const data = await response.json()
        if (!response.ok) {
          alert(data.error || 'Erro ao excluir usuário.')
          return
        }
      } else {
        const response = await fetch(`/api/users/${userActionTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: userActionTarget.action })
        })
        const data = await response.json()
        if (!response.ok) {
          alert(data.error || 'Erro ao processar ação.')
          return
        }
      }

      // Recarregar lista de usuários
      await reloadUsers()
    } catch {
      alert('Erro de conexão.')
    } finally {
      setUserActionLoading(false)
      setIsUserConfirmModalOpen(false)
      setUserActionTarget(null)
    }
  }


  function openEditUserModal(u: Profile) {
    setEditUserId(u.id)
    setEditUserEmail(u.email)
    setEditUserName(u.full_name || 'Usuário Sem Nome')
    setEditUserRole(u.role)
    setEditUserError('')
    setEditUserSuccess('')
    setIsUserEditModalOpen(true)
  }

  async function handleUpdateUserRole(e: React.FormEvent) {
    e.preventDefault()
    setEditUserLoading(true)
    setEditUserError('')
    setEditUserSuccess('')

    try {
      const response = await fetch(`/api/users/${editUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editUserRole })
      })

      const data = await response.json()

      if (!response.ok) {
        setEditUserError(data.error || 'Erro ao atualizar nível de acesso.')
        setEditUserLoading(false)
        return
      }

      setEditUserSuccess('Nível de acesso atualizado com sucesso!')
      
      // Recarregar lista de usuários
      await reloadUsers()

      setTimeout(() => {
        setIsUserEditModalOpen(false)
      }, 1500)
    } catch {
      setEditUserError('Erro de conexão.')
    } finally {
      setEditUserLoading(false)
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
            onClick={() => changeTab('dashboard')}
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            📊 Dashboard
          </button>
          
          {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
            <button
              onClick={() => changeTab('invites')}
              className={`menu-item ${activeTab === 'invites' ? 'active' : ''}`}
            >
              ✉️ Convites
            </button>
          )}

          {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
            <button
              onClick={() => changeTab('users')}
              className={`menu-item ${activeTab === 'users' ? 'active' : ''}`}
            >
              👥 Usuários
            </button>
          )}

          <button
            onClick={() => changeTab('settings')}
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
                      ref={inviteEmailInputRef}
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

                  <div style={{ fontSize: '0.78rem', color: '#8b8fa8', display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '1.25rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                    <span>ℹ️</span>
                    <span>Você definirá o prazo de expiração do convite na próxima etapa.</span>
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
                    {invitations.map((inv) => {
                      const displayStatus = getInviteDisplayStatus(inv)
                      const expirationText = getExpirationText(inv.expires_at)
                      return (
                      <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{inv.email}</div>
                          <div style={{ fontSize: '0.78rem', color: '#8b8fa8', marginTop: '0.125rem' }}>
                            Papel: <strong>{inv.role}</strong> &bull; Enviado em: <strong>{new Date(inv.created_at).toLocaleDateString('pt-BR')} {new Date(inv.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                          </div>
                          {expirationText && displayStatus !== 'accepted' && (
                            <div style={{ fontSize: '0.7rem', color: displayStatus === 'expired' ? '#ef4444' : '#8b8fa8', marginTop: '0.25rem' }}>
                              ⏱️ {expirationText}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', gap: '0.375rem' }}>
                            {/* Reenviar rápida (Anula o link anterior): disponível para pendentes e expirados */}
                            {(displayStatus === 'pending' || displayStatus === 'expired') && (
                              <button 
                                onClick={() => openQuickResendConfirm(inv)}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0 }}
                                title="Reenviar Convite (Anula o anterior)"
                              >
                                🔄
                              </button>
                            )}
                            {/* Editar e Reenviar */}
                            {(displayStatus === 'pending' || displayStatus === 'expired') && (
                              <button 
                                onClick={() => openEditInviteModal(inv)}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0 }}
                                title="Editar e Reenviar"
                              >
                                ✏️
                              </button>
                            )}
                            {/* Excluir: disponível para todos os status */}
                            <button 
                              onClick={() => handleDeleteInvite(inv.id)}
                              className="profile-action-btn"
                              style={{ width: '2rem', height: '2rem', padding: 0, borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                              title="Excluir Convite"
                            >
                              🗑️
                            </button>
                          </div>
                          <span 
                            style={{ 
                              padding: '0.25rem 0.5rem', 
                              fontSize: '0.75rem', 
                              borderRadius: '6px', 
                              border: 'none', 
                              margin: 0,
                              fontWeight: 600,
                              background: displayStatus === 'accepted' 
                                ? 'rgba(34, 197, 94, 0.15)' 
                                : displayStatus === 'expired' 
                                  ? 'rgba(239, 68, 68, 0.15)' 
                                  : 'rgba(234, 179, 8, 0.15)',
                              color: displayStatus === 'accepted' 
                                ? '#22c55e' 
                                : displayStatus === 'expired' 
                                  ? '#ef4444' 
                                  : '#eab308'
                            }}
                          >
                            {displayStatus === 'accepted' ? 'Aceito' : displayStatus === 'expired' ? 'Expirado' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    )})}
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
                    <th>Status</th>
                    <th>Data de Cadastro</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((u) => {
                    const uInitials = u.full_name
                      ? u.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                      : 'U';
                    const isSelf = u.id === profile?.id
                    const isBanned = u.banned_until && new Date(u.banned_until) > new Date()
                    const canManage = !isSelf && !(profile?.role === 'administrador' && u.role === 'sistema')
                    return (
                      <tr key={u.id} style={{ opacity: isBanned ? 0.6 : 1 }}>
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
                        <td>
                          {isBanned ? (
                            <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}>
                              🔒 Bloqueado
                            </span>
                          ) : (
                            <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
                              ✅ Ativo
                            </span>
                          )}
                        </td>
                        <td style={{ color: '#8b8fa8' }}>
                          {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {canManage ? (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem' }}>
                              <button
                                onClick={() => openEditUserModal(u)}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0 }}
                                title="Editar Nível de Acesso"
                              >
                                ✏️
                              </button>
                              {isBanned ? (
                                <button
                                  onClick={() => openUserAction(u.id, u.full_name || u.email, 'unban')}
                                  className="profile-action-btn"
                                  style={{ width: '2rem', height: '2rem', padding: 0 }}
                                  title="Desbloquear Usuário"
                                >
                                  🔓
                                </button>
                              ) : (
                                <button
                                  onClick={() => openUserAction(u.id, u.full_name || u.email, 'ban')}
                                  className="profile-action-btn"
                                  style={{ width: '2rem', height: '2rem', padding: 0 }}
                                  title="Bloquear Usuário"
                                >
                                  🔒
                                </button>
                              )}
                              <button
                                onClick={() => openUserAction(u.id, u.full_name || u.email, 'delete')}
                                className="profile-action-btn"
                                style={{ width: '2rem', height: '2rem', padding: 0, borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                                title="Excluir Usuário"
                              >
                                🗑️
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: '#555', fontSize: '0.75rem' }}>
                              {isSelf ? 'Você' : '—'}
                            </span>
                          )}
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

              <div className="form-field">
                <label className="form-label">Validade do Convite</label>
                <select
                  value={editInviteExpirationChoice}
                  onChange={(e) => setEditInviteExpirationChoice(e.target.value as any)}
                  className="form-input"
                  style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                >
                  <option value="24">24 horas (1 dia)</option>
                  <option value="48">48 horas (2 dias - Recomendado)</option>
                  <option value="72">72 horas (3 dias)</option>
                  <option value="168">7 dias (1 semana)</option>
                  <option value="custom">Personalizado...</option>
                </select>
              </div>

              {editInviteExpirationChoice === 'custom' && (
                <div className="form-field">
                  <label className="form-label">Data/Hora Limite de Expiração</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={editInviteExpirationCustomDate}
                    onChange={(e) => setEditInviteExpirationCustomDate(e.target.value)}
                    required
                  />
                </div>
              )}

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

      {/* Modal de Confirmação Moderna */}
      {isConfirmModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
              Anular e Excluir Convite
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.75rem' }}>
              Deseja realmente anular e excluir este convite? O link enviado no e-mail não funcionará mais.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setIsConfirmModalOpen(false)
                  setInviteIdToDelete(null)
                }}
                className="btn-secondary"
                style={{ width: 'auto', padding: '0 1.5rem' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteInvite}
                className="btn-primary"
                style={{ width: 'auto', padding: '0 1.5rem', marginTop: 0, background: '#ef4444', boxShadow: '0 4px 20px rgba(239, 68, 68, 0.35)' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Ação em Usuário */}
      {isUserConfirmModalOpen && userActionTarget && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
              {userActionTarget.action === 'delete' ? '🗑️' : userActionTarget.action === 'ban' ? '🔒' : '🔓'}
            </div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
              {userActionTarget.action === 'delete' && 'Excluir Usuário'}
              {userActionTarget.action === 'ban' && 'Bloquear Usuário'}
              {userActionTarget.action === 'unban' && 'Desbloquear Usuário'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '0.5rem' }}>
              {userActionTarget.action === 'delete' && (
                <>Deseja realmente <strong>excluir permanentemente</strong> o usuário <strong>{userActionTarget.name}</strong>? Esta ação não pode ser desfeita.</>
              )}
              {userActionTarget.action === 'ban' && (
                <>Deseja <strong>bloquear</strong> o acesso do usuário <strong>{userActionTarget.name}</strong>? Ele não conseguirá fazer login até ser desbloqueado.</>
              )}
              {userActionTarget.action === 'unban' && (
                <>Deseja <strong>desbloquear</strong> o acesso do usuário <strong>{userActionTarget.name}</strong>? Ele poderá fazer login novamente.</>
              )}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  setIsUserConfirmModalOpen(false)
                  setUserActionTarget(null)
                }}
                className="btn-secondary"
                style={{ width: 'auto', padding: '0 1.5rem' }}
                disabled={userActionLoading}
              >
                Cancelar
              </button>
              <button
                onClick={confirmUserAction}
                className="btn-primary"
                style={{ 
                  width: 'auto', 
                  padding: '0 1.5rem', 
                  marginTop: 0, 
                  background: userActionTarget.action === 'unban' ? '#22c55e' : '#ef4444', 
                  boxShadow: userActionTarget.action === 'unban' 
                    ? '0 4px 20px rgba(34, 197, 94, 0.35)' 
                    : '0 4px 20px rgba(239, 68, 68, 0.35)' 
                }}
                disabled={userActionLoading}
              >
                {userActionLoading ? <span className="spinner" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editar Papel do Usuário */}
      {isUserEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Alterar Nível de Acesso</h3>
              <button onClick={() => setIsUserEditModalOpen(false)} className="modal-close">
                &times;
              </button>
            </div>

            {editUserError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠️</span>
                <span>{editUserError}</span>
              </div>
            )}

            {editUserSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <span>✅</span>
                <span>{editUserSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUserRole} className="auth-form" noValidate>
              <div className="form-field">
                <label className="form-label">Usuário</label>
                <input
                  type="text"
                  className="form-input"
                  value={editUserName}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">E-mail</label>
                <input
                  type="email"
                  className="form-input"
                  value={editUserEmail}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Nível de Acesso (Papel)</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value)}
                  className="form-input"
                  style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                >
                  <option value="operador">Operador</option>
                  <option value="administrador">Administrador</option>
                  {profile?.role === 'sistema' && (
                    <option value="sistema">Sistema</option>
                  )}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setIsUserEditModalOpen(false)}
                  className="btn-secondary"
                  disabled={editUserLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: 0 }}
                  disabled={editUserLoading}
                >
                  {editUserLoading ? <span className="spinner" /> : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Reenvio de Convite */}
      {isResendConfirmModalOpen && inviteToResend && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔄</div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
              Reenviar Convite
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.75rem' }}>
              Deseja realmente reenviar o convite para <strong>{inviteToResend.email}</strong>? 
              O link enviado anteriormente será <strong>anulado permanentemente</strong>.
            </p>
            
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

            <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setIsResendConfirmModalOpen(false)
                  setInviteToResend(null)
                  setEditInviteError('')
                  setEditInviteSuccess('')
                }}
                className="btn-secondary"
                style={{ width: 'auto', padding: '0 1.5rem' }}
                disabled={editInviteLoading}
              >
                Cancelar
              </button>
              <button
                onClick={confirmQuickResendInvite}
                className="btn-primary"
                style={{ 
                  width: 'auto', 
                  padding: '0 1.5rem', 
                  marginTop: 0, 
                  background: 'var(--primary)', 
                  boxShadow: '0 4px 20px rgba(124, 58, 237, 0.35)' 
                }}
                disabled={editInviteLoading}
              >
                {editInviteLoading ? <span className="spinner" /> : 'Confirmar Reenvio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Envio com Validade Personalizada */}
      {isInviteConfirmModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Confirmar e Enviar Convite</h3>
              <button 
                onClick={() => {
                  setIsInviteConfirmModalOpen(false)
                  setInviteLoading(false)
                }} 
                className="modal-close"
              >
                &times;
              </button>
            </div>

            {inviteError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠️</span>
                <span>{inviteError}</span>
              </div>
            )}

            <div style={{ marginBottom: '1.25rem', padding: '0.875rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.82rem', color: '#8b8fa8', marginBottom: '0.25rem' }}>E-mail de Destino</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>{inviteEmail}</div>
              
              <div style={{ fontSize: '0.82rem', color: '#8b8fa8', marginTop: '0.75rem', marginBottom: '0.25rem' }}>Nível de Acesso (Papel)</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, display: 'inline-block', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', textTransform: 'capitalize' }}>
                {inviteRole}
              </div>
            </div>

            <div className="auth-form">
              <div className="form-field">
                <label className="form-label">Definir Validade do Convite</label>
                <select
                  value={inviteExpirationChoice}
                  onChange={(e) => setInviteExpirationChoice(e.target.value as any)}
                  className="form-input"
                  style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                >
                  <option value="24">24 horas (1 dia)</option>
                  <option value="48">48 horas (2 dias - Sugerido)</option>
                  <option value="72">72 horas (3 dias)</option>
                  <option value="168">7 dias (1 semana)</option>
                  <option value="custom">Personalizado...</option>
                </select>
              </div>

              {inviteExpirationChoice === 'custom' && (
                <div className="form-field">
                  <label className="form-label">Data/Hora Limite de Expiração</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={inviteExpirationCustomDate}
                    onChange={(e) => setInviteExpirationCustomDate(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '1.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteConfirmModalOpen(false)
                    setInviteLoading(false)
                  }}
                  className="btn-secondary"
                  disabled={inviteLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmSendInvite}
                  className="btn-primary"
                  style={{ marginTop: 0 }}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? <span className="spinner" /> : 'Confirmar e Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


