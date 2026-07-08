'use client'

import { useState } from 'react'
import { useDashboard, Profile } from '../layout'

export default function UsuariosPage() {
  const { profile, allUsers, reloadUsers } = useDashboard()

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

  // Ações do Gerenciamento de Usuários
  function openUserAction(userId: string, userName: string, action: 'delete' | 'ban' | 'unban') {
    setUserActionTarget({ id: userId, name: userName, action })
    setIsUserConfirmModalOpen(true)
  }

  async function confirmUserAction() {
    if (!userActionTarget || !profile) return
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
      await reloadUsers(profile.role)
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
    if (!profile) return
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
      await reloadUsers(profile.role)

      setTimeout(() => {
        setIsUserEditModalOpen(false)
      }, 1500)
    } catch {
      setEditUserError('Erro de conexão.')
    } finally {
      setEditUserLoading(false)
    }
  }

  return (
    <div>
      <div className="content-header">
        <h2 className="content-title">Usuários Cadastrados</h2>
        <p className="content-subtitle">Membros registrados na plataforma WiseMentor</p>
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
              )
            })}
          </tbody>
        </table>
      </div>

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
                  {editUserLoading ? <span className="spinner" /> : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
