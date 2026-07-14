'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: 'sistema' | 'administrador' | 'operador'
  avatar_url: string
  created_at: string
  banned?: boolean
}

export interface Invitation {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
  expires_at?: string | null
}

interface DashboardContextType {
  profile: Profile | null
  loading: boolean
  invitations: Invitation[]
  allUsers: Profile[]
  reloadInvitations: (role: string) => Promise<void>
  reloadUsers: (role: string) => Promise<void>
  reloadProfile: () => Promise<void>
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

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

  // 1. Obter usuário logado e dados iniciais
  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, created_at, banned')
      .eq('id', user.id)
      .single()

    if (userProfile && userProfile.banned) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    if (profileError || !userProfile) {
      console.log('Perfil não encontrado no loadData. Efetuando logout...')
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    let loadedProfile: Profile = {
      ...(userProfile as Profile),
      email: user.email || (userProfile as Profile).email
    }
    setProfile(loadedProfile)

    // Bloquear acessos indevidos de operadores a convites/usuários
    if (loadedProfile.role === 'operador') {
      if (pathname.includes('/convites') || pathname.includes('/usuarios')) {
        router.push('/dashboard')
        return
      }
    }

    // Carregar listas dependendo do papel
    if (loadedProfile.role === 'sistema' || loadedProfile.role === 'administrador') {
      await reloadInvitations(loadedProfile.role)
      await reloadUsers(loadedProfile.role)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Recarregar dados do perfil a cada navegação de rota
  useEffect(() => {
    if (profile) {
      reloadProfile()
    }
  }, [pathname])

  // Inscrição Realtime para atualizações do perfil do usuário em tempo real
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`profile-updates-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`
        },
        async (payload: any) => {
          console.log('Alteração de perfil em tempo real recebida:', payload)
          if (payload.eventType === 'DELETE') {
            console.log('Perfil excluído via Realtime. Efetuando logout...')
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
            return
          }
          if (payload.new) {
            if (payload.new.banned === true) {
              console.log('Usuário bloqueado via Realtime. Efetuando logout...')
              await supabase.auth.signOut()
              router.push('/login')
              router.refresh()
            } else {
              // Se o papel (role) ou outras informações mudarem, recarrega o perfil
              reloadProfile()
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  // Inscrição Realtime para atualizações da tabela de convites (apenas para administradores/sistema)
  useEffect(() => {
    if (!profile || (profile.role !== 'sistema' && profile.role !== 'administrador')) return

    const channel = supabase
      .channel('invitation-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invitations'
        },
        () => {
          console.log('Convite alterado em tempo real. Recarregando convites...')
          reloadInvitations(profile.role)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.role])

  // Inscrição Realtime para atualizações da tabela de perfis de todos os usuários (apenas para administradores/sistema)
  useEffect(() => {
    if (!profile || (profile.role !== 'sistema' && profile.role !== 'administrador')) return

    const channel = supabase
      .channel('profiles-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          console.log('Perfis alterados em tempo real. Recarregando usuários...')
          reloadUsers(profile.role)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.role])

  // Proteção de rotas dinâmicas a cada alteração do pathname ou do perfil
  useEffect(() => {
    if (profile && profile.role === 'operador') {
      if (pathname.includes('/convites') || pathname.includes('/usuarios')) {
        router.push('/dashboard')
      }
    }
  }, [pathname, profile])

  // Buscar convites de forma resiliente
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

  // Buscar usuários com status de bloqueio via API (inclui banned_until do Auth)
  async function reloadUsers(userRole: string) {
    if (userRole !== 'sistema' && userRole !== 'administrador') return
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        if (data.users) setAllUsers(data.users as Profile[])
      }
    } catch {
      // fallback silencioso
    }
  }

  // Recarregar perfil
  async function reloadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, created_at, banned')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile) {
      console.log('Perfil não encontrado no reloadProfile. Efetuando logout...')
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    if (userProfile.banned) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }

    if (userProfile) {
      const updatedProfile: Profile = {
        ...(userProfile as Profile),
        email: user.email || (userProfile as Profile).email
      }
      setProfile(updatedProfile)
      // Recarregar coleções de acordo com o novo papel
      await reloadInvitations(updatedProfile.role)
      await reloadUsers(updatedProfile.role)
    }
  }

  // Ações do perfil
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

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setEditError('Sessão expirada. Faça login novamente.')
      setEditLoading(false)
      return
    }

    // 1. Upload do Avatar
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

    // 2. Atualizar senha se fornecida
    if (editPassword) {
      if (editPassword !== editConfirmPassword) {
        setEditError('As senhas não coincidem.')
        setEditLoading(false)
        return
      }
      if (editPassword.length < 6) {
        setEditError('A senha deve ter pelo menos 6 caracteres.')
        setEditLoading(false)
        return
      }
      updates.password = editPassword
    }

    // 3. Executar atualizações no Auth
    const { error: updateError } = await supabase.auth.updateUser(updates)
    if (updateError) {
      setEditError(updateError.message)
      setEditLoading(false)
      return
    }

    // 4. Sincronizar tabela profiles pública
    const { error: dbError } = await supabase
      .from('profiles')
      .update({
        full_name: editName,
        avatar_url: newAvatarUrl
      })
      .eq('id', user.id)

    if (dbError) {
      setEditError(`Atualizado no Auth, mas falhou ao sincronizar perfil: ${dbError.message}`)
      setEditLoading(false)
      return
    }

    setEditSuccess('Perfil atualizado com sucesso!')
    await reloadProfile()
    if (profile) {
      await reloadUsers(profile.role)
    }

    setTimeout(() => {
      setIsProfileModalOpen(false)
    }, 1500)

    setEditLoading(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0f14' }}>
        <span className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    )
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U'

  return (
    <DashboardContext.Provider value={{
      profile,
      loading,
      invitations,
      allUsers,
      reloadInvitations,
      reloadUsers,
      reloadProfile
    }}>
      <div className="app-container">
        {/* Menu Lateral (Sidebar) */}
        <aside className="sidebar">
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

          <nav className="sidebar-menu">
            <Link
              href="/dashboard"
              className={`menu-item ${pathname === '/dashboard' ? 'active' : ''}`}
            >
              📊 Dashboard
            </Link>

            <Link
              href="/clientes"
              className={`menu-item ${pathname === '/clientes' ? 'active' : ''}`}
            >
              💼 Clientes
            </Link>
            
            {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
              <Link
                href="/convites"
                className={`menu-item ${pathname === '/convites' ? 'active' : ''}`}
              >
                ✉️ Convites
              </Link>
            )}

            {(profile?.role === 'sistema' || profile?.role === 'administrador') && (
              <Link
                href="/usuarios"
                className={`menu-item ${pathname === '/usuarios' ? 'active' : ''}`}
              >
                👥 Usuários
              </Link>
            )}

            <Link
              href="/configuracoes"
              className={`menu-item ${pathname === '/configuracoes' ? 'active' : ''}`}
            >
              🛠️ Configurações
            </Link>
          </nav>
        </aside>

        {/* Conteúdo Principal */}
        <main className="main-content">
          {children}
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
                <div className="form-field" style={{ alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    {avatarPreview ? (
                      <img 
                        src={avatarPreview} 
                        alt="Avatar Preview" 
                        style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} 
                      />
                    ) : (
                      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 600 }}>
                        {initials}
                      </div>
                    )}
                    <label className="btn-secondary" style={{ cursor: 'pointer', padding: '0.375rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0 }}>
                      📸 Alterar Imagem
                      <input 
                        type="file" 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setAvatarFile(file)
                            setAvatarPreview(URL.createObjectURL(file))
                          }
                        }}
                      />
                    </label>
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
                  <label className="form-label">Nova Senha (deixe em branco para manter a mesma)</label>
                  <div className="password-input-container">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input form-input-password"
                      placeholder="••••••••"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      required
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
    </DashboardContext.Provider>
  )
}
