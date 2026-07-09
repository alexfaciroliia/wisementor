'use client'

import { useState, useRef, useEffect } from 'react'
import { useDashboard, Invitation } from '../layout'
import { createClient } from '@/lib/supabase/client'

export default function ConvitesPage() {
  const { profile, invitations, reloadInvitations } = useDashboard()
  const supabase = createClient()
  const inviteEmailInputRef = useRef<HTMLInputElement>(null)

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

  // Link gerado e status de envio (para fallback quando há rate limit no envio do e-mail)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [inviteEmailSent, setInviteEmailSent] = useState(true)

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

  // Estados do modal de confirmação moderna (exclusão)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [inviteIdToDelete, setInviteIdToDelete] = useState<string | null>(null)

  // Estados do modal de confirmação de reenvio rápido de convite
  const [isResendConfirmModalOpen, setIsResendConfirmModalOpen] = useState(false)
  const [inviteToResend, setInviteToResend] = useState<Invitation | null>(null)

  // Foco automático ao carregar
  useEffect(() => {
    inviteEmailInputRef.current?.focus()
  }, [])

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
      const agoMs = Math.abs(diffMs)
      const agoHours = Math.floor(agoMs / (1000 * 60 * 60))
      if (agoHours < 1) return 'Expirado há poucos minutos'
      if (agoHours < 24) return `Expirado há ${agoHours}h`
      const agoDays = Math.ceil(agoHours / 24)
      return `Expirado há ${agoDays} dia${agoDays > 1 ? 's' : ''}`
    }

    const remainHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (remainHours < 1) return 'Expira em breve'
    if (remainHours < 24) return `Expira em ${remainHours}h`
    const remainDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return `Expira em ${remainDays} dia${remainDays > 1 ? 's' : ''}`
  }

  // Ações do Envio de Convite
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
    setGeneratedLink(null)
    setInviteEmailSent(true)

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

    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, expiresAt: expiresAtISO }),
      })

      const data = await response.json()

      if (!response.ok) {
        setInviteError(data.error || 'Erro ao enviar o convite.')
        setInviteLoading(false)
        return
      }

      setInviteEmailSent(data.emailSent !== false)
      setGeneratedLink(data.actionLink || null)

      const expDateFormatted = new Date(expiresAtISO).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })

      if (data.emailSent === false) {
        setInviteSuccess(`Convite registrado para ${inviteEmail}, mas houve erro ao disparar o e-mail (limite excedido). Válido até ${expDateFormatted}.`)
      } else {
        setInviteSuccess(`Convite enviado por e-mail com sucesso para ${inviteEmail}! Válido até ${expDateFormatted}.`)
        setInviteEmail('')
      }

      if (profile?.role) {
        await reloadInvitations(profile.role)
      }

      if (data.emailSent !== false) {
        setIsInviteConfirmModalOpen(false)
      }
    } catch {
      setInviteError('Erro de conexão ao enviar convite.')
    } finally {
      setInviteLoading(false)
    }
  }

  // Ações da Exclusão de Convite
  function openConfirmDeleteInvite(id: string) {
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

    if (profile?.role) {
      await reloadInvitations(profile.role)
    }

    setIsConfirmModalOpen(false)
    setInviteIdToDelete(null)
  }

  // Ações da Edição de Convite
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
    setGeneratedLink(null)
    setInviteEmailSent(true)

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

    try {
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

      setInviteEmailSent(data.emailSent !== false)
      setGeneratedLink(data.actionLink || null)

      if (data.emailSent === false) {
        setEditInviteSuccess('Convite atualizado com sucesso (e-mail não enviado por limite excedido).')
      } else {
        setEditInviteSuccess('Convite atualizado e enviado por e-mail com sucesso!')
      }
      
      if (profile?.role) {
        await reloadInvitations(profile.role)
      }

      if (data.emailSent !== false) {
        setTimeout(() => {
          setIsInviteModalOpen(false)
        }, 1500)
      }
    } catch {
      setEditInviteError('Erro de conexão ao atualizar convite.')
    } finally {
      setEditInviteLoading(false)
    }
  }

  // Ações de Reenvio Rápido de Convite
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
    setGeneratedLink(null)
    setInviteEmailSent(true)

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

      setInviteEmailSent(data.emailSent !== false)
      setGeneratedLink(data.actionLink || null)

      if (data.emailSent === false) {
        setEditInviteSuccess('Convite registrado com sucesso (e-mail não enviado por limite excedido).')
      } else {
        setEditInviteSuccess('Convite reenviado por e-mail com sucesso! Link anterior anulado.')
      }
      
      if (profile?.role) {
        await reloadInvitations(profile.role)
      }

      if (data.emailSent !== false) {
        setTimeout(() => {
          setIsResendConfirmModalOpen(false)
          setInviteToResend(null)
          setEditInviteError('')
          setEditInviteSuccess('')
        }, 1500)
      }
    } catch {
      setEditInviteError('Erro de conexão ao reenviar convite.')
    } finally {
      setEditInviteLoading(false)
    }
  }

  return (
    <div>
      <div className="content-header">
        <h2 className="content-title">Gestão de Convites</h2>
        <p className="content-subtitle">Convide novos membros e gerencie acessos</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
        {/* Formulario de Convite */}
        <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem', height: 'fit-content' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Convidar Usuário</h3>
          
          {inviteError && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              <span>⚠️</span>
              <span>{inviteError}</span>
            </div>
          )}

          {inviteSuccess && (
            <div className="alert alert-success" style={{ marginBottom: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{inviteEmailSent ? '✅' : '⚠️'}</span>
                <span>{inviteSuccess}</span>
              </div>
              {!inviteEmailSent && generatedLink && (
                <div style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#8b8fa8', marginBottom: '0.375rem' }}>
                    O limite de e-mails foi excedido. Envie o link de acesso manualmente:
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      readOnly
                      value={generatedLink}
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '0.375rem 0.5rem', background: 'rgba(255,255,255,0.03)' }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: 'auto', padding: '0 0.75rem', fontSize: '0.8rem', margin: 0 }}
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLink)
                        alert('Link copiado!')
                      }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
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

            <button type="submit" className="btn-primary" disabled={inviteLoading}>
              {inviteLoading ? <span className="spinner" /> : 'Enviar Convite'}
            </button>
          </form>
        </div>

        {/* Histórico de Convites */}
        <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>Histórico de Convites</h3>
          {invitations.length === 0 ? (
            <p style={{ color: '#8b8fa8', fontSize: '0.9rem' }}>Nenhum convite enviado até o momento.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {invitations.map((inv) => {
                const displayStatus = getInviteDisplayStatus(inv)
                const expText = getExpirationText(inv.expires_at)
                const sendDate = new Date(inv.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })

                return (
                  <div 
                    key={inv.id} 
                    style={{ 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                        {inv.email}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#8b8fa8', marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <span>Papel: <strong style={{ color: '#c0c4e0' }}>{inv.role}</strong></span>
                        <span>•</span>
                        <span>Enviado em: {sendDate}</span>
                        {expText && displayStatus !== 'accepted' && (
                          <>
                            <span>•</span>
                            <span style={{ 
                              color: displayStatus === 'expired' ? '#ef4444' : '#10b981', 
                              fontWeight: 500 
                            }}>
                              {expText}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {displayStatus !== 'accepted' && (
                        <button 
                          onClick={() => openQuickResendConfirm(inv)}
                          style={{ background: 'rgba(59, 130, 246, 0.1)', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0.375rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Anular anterior e Reenviar convite"
                        >
                          🔄
                        </button>
                      )}

                      {displayStatus !== 'accepted' && (
                        <button 
                          onClick={() => openEditInviteModal(inv)}
                          style={{ background: 'rgba(245, 158, 11, 0.1)', border: 'none', color: '#fbbf24', cursor: 'pointer', padding: '0.375rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Editar e Reenviar"
                        >
                          ✏️
                        </button>
                      )}

                      <button 
                        onClick={() => openConfirmDeleteInvite(inv.id)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.375rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Excluir Convite"
                      >
                        🗑️
                      </button>

                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        textTransform: 'capitalize',
                        background: displayStatus === 'accepted' 
                          ? 'rgba(16, 185, 129, 0.15)' 
                          : displayStatus === 'expired' 
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        color: displayStatus === 'accepted' 
                          ? '#10b981' 
                          : displayStatus === 'expired'
                            ? '#f87171'
                            : '#fbbf24'
                      }}>
                        {displayStatus === 'accepted' ? 'Aceito' : displayStatus === 'expired' ? 'Expirado' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Editar/Reenviar Convite */}
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
              <div className="alert alert-success" style={{ marginBottom: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{inviteEmailSent ? '✅' : '⚠️'}</span>
                  <span>{editInviteSuccess}</span>
                </div>
                {!inviteEmailSent && generatedLink && (
                  <div style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8b8fa8', marginBottom: '0.375rem' }}>
                      O limite de e-mails foi excedido. Envie o link de acesso manualmente:
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="form-input"
                        style={{ fontSize: '0.8rem', padding: '0.375rem 0.5rem', background: 'rgba(255,255,255,0.03)' }}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: 'auto', padding: '0 0.75rem', fontSize: '0.8rem', margin: 0 }}
                        onClick={() => {
                          navigator.clipboard.writeText(generatedLink)
                          alert('Link copiado!')
                        }}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                )}
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

      {/* Modal de Confirmação de Exclusão */}
      {isConfirmModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>Excluir Convite?</h3>
            <p style={{ color: '#8b8fa8', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              Esta ação removerá o convite do histórico e o link correspondente será invalidado definitivamente.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
              <button onClick={() => setIsConfirmModalOpen(false)} className="btn-secondary" style={{ width: 'auto', padding: '0 1.5rem' }}>
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteInvite} 
                className="btn-primary" 
                style={{ width: 'auto', padding: '0 1.5rem', marginTop: 0, background: '#ef4444' }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Reenvio Rápido */}
      {isResendConfirmModalOpen && inviteToResend && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <span style={{ fontSize: '1.5rem', color: '#3b82f6' }}>🔄</span>
            </div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>Reenviar Convite</h3>
            <p style={{ color: '#8b8fa8', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Deseja realmente reenviar o convite para <strong>{inviteToResend.email}</strong>? O link enviado anteriormente será <strong>anulado permanentemente</strong>.
            </p>
            
            {editInviteError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem', textAlign: 'left' }}>
                <span>⚠️</span>
                <span>{editInviteError}</span>
              </div>
            )}

            {editInviteSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{inviteEmailSent ? '✅' : '⚠️'}</span>
                  <span>{editInviteSuccess}</span>
                </div>
                {!inviteEmailSent && generatedLink && (
                  <div style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8b8fa8', marginBottom: '0.375rem' }}>
                      O limite de e-mails foi excedido. Envie o link de acesso manualmente:
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="form-input"
                        style={{ fontSize: '0.8rem', padding: '0.375rem 0.5rem', background: 'rgba(255,255,255,0.03)' }}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: 'auto', padding: '0 0.75rem', fontSize: '0.8rem', margin: 0 }}
                        onClick={() => {
                          navigator.clipboard.writeText(generatedLink)
                          alert('Link copiado!')
                        }}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                )}
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

            {inviteSuccess ? (
              <div className="auth-form">
                <div className="alert alert-success" style={{ marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{inviteEmailSent ? '✅' : '⚠️'}</span>
                    <span>{inviteSuccess}</span>
                  </div>
                  {!inviteEmailSent && generatedLink && (
                    <div style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#8b8fa8', marginBottom: '0.375rem' }}>
                        O limite de e-mails foi excedido. Envie o link de acesso manualmente:
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          readOnly
                          value={generatedLink}
                          className="form-input"
                          style={{ fontSize: '0.8rem', padding: '0.375rem 0.5rem', background: 'rgba(255,255,255,0.03)' }}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ width: 'auto', padding: '0 0.75rem', fontSize: '0.8rem', margin: 0 }}
                          onClick={() => {
                            navigator.clipboard.writeText(generatedLink)
                            alert('Link copiado!')
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsInviteConfirmModalOpen(false)
                      setInviteSuccess('')
                      setGeneratedLink(null)
                    }}
                    className="btn-secondary"
                    style={{ width: 'auto', padding: '0 1.5rem' }}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
