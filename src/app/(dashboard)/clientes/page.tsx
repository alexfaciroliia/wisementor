'use client'

import { useState, useEffect } from 'react'
import { useDashboard } from '../layout'
import { createClient } from '@/lib/supabase/client'

interface ClientData {
  id: string
  name: string
  email: string | null
  phone: string | null
  document: string | null
  address: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_by: string | null
  created_at: string
  updated_at: string
}

export default function ClientesPage() {
  const { profile } = useDashboard()
  const supabase = createClient()

  // Estados dos clientes
  const [clients, setClients] = useState<ClientData[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Estado para Criar/Editar Cliente
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  
  // Campos do Formulário
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formDocument, setFormDocument] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active')
  const [formLoading, setFormLoading] = useState(false)

  // Confirmação de Exclusão
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<ClientData | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Função para buscar clientes
  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        throw error
      }

      setClients(data as ClientData[])
    } catch (err: any) {
      console.error('Erro ao buscar clientes:', err)
      setErrorMsg('Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  // Realtime updates
  useEffect(() => {
    fetchClients()

    const channel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients'
        },
        () => {
          fetchClients()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Limpar mensagens de sucesso/erro após alguns segundos
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMsg])

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [errorMsg])

  // Abertura do Modal de Cadastro
  function openCreateModal() {
    setModalMode('create')
    setSelectedClientId(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormDocument('')
    setFormAddress('')
    setFormNotes('')
    setFormStatus('active')
    setIsModalOpen(true)
  }

  // Abertura do Modal de Edição
  function openEditModal(client: ClientData) {
    setModalMode('edit')
    setSelectedClientId(client.id)
    setFormName(client.name)
    setFormEmail(client.email || '')
    setFormPhone(client.phone || '')
    setFormDocument(client.document || '')
    setFormAddress(client.address || '')
    setFormNotes(client.notes || '')
    setFormStatus(client.status)
    setIsModalOpen(true)
  }

  // Envio do Formulário (Salvar / Atualizar)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setErrorMsg('O nome do cliente é obrigatório.')
      return
    }

    setFormLoading(true)

    try {
      if (modalMode === 'create') {
        const { error } = await supabase
          .from('clients')
          .insert({
            name: formName.trim(),
            email: formEmail.trim() || null,
            phone: formPhone.trim() || null,
            document: formDocument.trim() || null,
            address: formAddress.trim() || null,
            notes: formNotes.trim() || null,
            status: formStatus,
            created_by: profile?.id || null
          })

        if (error) throw error
        setSuccessMsg('Cliente cadastrado com sucesso!')
      } else {
        const { error } = await supabase
          .from('clients')
          .update({
            name: formName.trim(),
            email: formEmail.trim() || null,
            phone: formPhone.trim() || null,
            document: formDocument.trim() || null,
            address: formAddress.trim() || null,
            notes: formNotes.trim() || null,
            status: formStatus
          })
          .eq('id', selectedClientId)

        if (error) throw error
        setSuccessMsg('Cadastro do cliente atualizado!')
      }

      setIsModalOpen(false)
      fetchClients()
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err)
      setErrorMsg(err.message || 'Erro ao processar requisição.')
    } finally {
      setFormLoading(false)
    }
  }

  // Alternar Status Inline (Ativar / Inativar)
  async function toggleStatus(client: ClientData) {
    const newStatus = client.status === 'active' ? 'inactive' : 'active'
    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', client.id)

      if (error) throw error
      setSuccessMsg(`Cliente ${newStatus === 'active' ? 'ativado' : 'desativado'} com sucesso!`)
      fetchClients()
    } catch (err: any) {
      console.error('Erro ao alterar status:', err)
      setErrorMsg('Não foi possível alterar o status.')
    }
  }

  // Abertura do modal de confirmação de exclusão
  function openConfirmDelete(client: ClientData) {
    setClientToDelete(client)
    setIsConfirmDeleteOpen(true)
  }

  // Exclusão Física do Cliente
  async function handleDelete() {
    if (!clientToDelete) return
    setDeleteLoading(true)

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete.id)

      if (error) throw error
      setSuccessMsg('Cliente excluído permanentemente.')
      setIsConfirmDeleteOpen(false)
      setClientToDelete(null)
      fetchClients()
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err)
      setErrorMsg(err.message || 'Erro ao tentar excluir cliente.')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Filtragem local baseada nos estados de busca e filtro de status
  const filteredClients = clients.filter(c => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    const matchesSearch = 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.document && c.document.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.phone && c.phone.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesStatus && matchesSearch
  })

  // Permissões
  const isMasterOrAdmin = profile?.role === 'sistema' || profile?.role === 'administrador'

  return (
    <div>
      {/* Cabeçalho */}
      <div className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="content-title">Clientes</h2>
          <p className="content-subtitle">Gerencie os clientes e contas parceiras vinculadas ao WiseMentor</p>
        </div>
        <button onClick={openCreateModal} className="btn-primary" style={{ marginTop: 0, padding: '0.625rem 1.25rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ➕ Novo Cliente
        </button>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filtros e Busca */}
      <div className="auth-card" style={{ maxWidth: '100%', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔎 Buscar por nome, documento, e-mail ou fone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '2.25rem' }}
          />
          <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setStatusFilter('all')}
            className={`btn-secondary ${statusFilter === 'all' ? 'active' : ''}`}
            style={{ 
              padding: '0.5rem 1rem', 
              fontSize: '0.85rem', 
              background: statusFilter === 'all' ? 'var(--bg-overlay-hover)' : '',
              borderColor: statusFilter === 'all' ? 'var(--accent)' : ''
            }}
          >
            Todos ({clients.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`btn-secondary ${statusFilter === 'active' ? 'active' : ''}`}
            style={{ 
              padding: '0.5rem 1rem', 
              fontSize: '0.85rem',
              background: statusFilter === 'active' ? 'var(--bg-overlay-hover)' : '',
              borderColor: statusFilter === 'active' ? '#22c55e' : ''
            }}
          >
            🟢 Ativos ({clients.filter(c => c.status === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`btn-secondary ${statusFilter === 'inactive' ? 'active' : ''}`}
            style={{ 
              padding: '0.5rem 1rem', 
              fontSize: '0.85rem',
              background: statusFilter === 'inactive' ? 'var(--bg-overlay-hover)' : '',
              borderColor: statusFilter === 'inactive' ? '#ef4444' : ''
            }}
          >
            🔴 Inativos ({clients.filter(c => c.status === 'inactive').length})
          </button>
        </div>
      </div>

      {/* Grid / Tabela */}
      <div className="user-table-card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>Carregando dados dos clientes...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💼</div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>Nenhum cliente encontrado</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem', maxWidth: '400px', margin: '0.25rem auto 1.5rem' }}>
              {searchQuery || statusFilter !== 'all' 
                ? 'Tente alterar os termos de busca ou filtros selecionados.' 
                : 'Comece cadastrando seu primeiro cliente parceiro na plataforma.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button onClick={openCreateModal} className="btn-primary" style={{ width: 'auto', padding: '0.625rem 1.25rem', display: 'inline-block', margin: '0 auto' }}>
                Cadastrar Cliente
              </button>
            )}
          </div>
        ) : (
          <table className="user-table">
            <thead>
              <tr>
                <th>Nome / Razão Social</th>
                <th>Documento (CPF/CNPJ)</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => {
                const initials = client.name
                  ? client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                  : 'CL'
                const isActive = client.status === 'active'

                return (
                  <tr key={client.id} style={{ opacity: isActive ? 1 : 0.65, transition: 'opacity 0.2s' }}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(167,139,250,0.15))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
                          {initials}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{client.name}</span>
                          {client.address && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={client.address}>
                              📍 {client.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{client.document || '—'}</td>
                    <td>{client.email || '—'}</td>
                    <td>{client.phone || '—'}</td>
                    <td>
                      <button 
                        onClick={() => toggleStatus(client)}
                        style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                        title={`Clique para ${isActive ? 'desativar' : 'ativar'} o cliente`}
                      >
                        {isActive ? (
                          <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            🟢 Ativo
                          </span>
                        ) : (
                          <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            🔴 Inativo
                          </span>
                        )}
                      </button>
                    </td>
                    <td style={{ color: '#8b8fa8', fontSize: '0.85rem' }}>
                      {new Date(client.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem' }}>
                        <button
                          onClick={() => openEditModal(client)}
                          className="profile-action-btn"
                          style={{ width: '2rem', height: '2rem', padding: 0 }}
                          title="Editar Cadastro"
                        >
                          ✏️
                        </button>
                        {isMasterOrAdmin && (
                          <button
                            onClick={() => openConfirmDelete(client)}
                            className="profile-action-btn"
                            style={{ width: '2rem', height: '2rem', padding: 0, borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                            title="Excluir Permanente"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Criar / Editar Cliente */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {modalMode === 'create' ? '💼 Novo Cliente' : '✏️ Editar Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="modal-close">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                
                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nome ou Razão Social *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nome completo ou Razão Social"
                    required
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Documento (CPF / CNPJ)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formDocument}
                    onChange={(e) => setFormDocument(e.target.value)}
                    placeholder="Ex: 000.000.000-00 ou 00.000.000/0001-00"
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Telefone de Contato</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                  />
                </div>

                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">E-mail Principal</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="Ex: cliente@empresa.com.br"
                  />
                </div>

                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Endereço Comercial</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>

                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Observações / Notas Privadas</label>
                  <textarea
                    className="form-input"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Informações relevantes sobre este cliente..."
                    style={{ height: '70px', padding: '0.5rem 0.875rem', resize: 'none' }}
                  />
                </div>

                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Status do Cliente</label>
                  <select
                    className="form-input"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'active' | 'inactive')}
                    style={{ background: 'var(--bg-overlay)', cursor: 'pointer' }}
                  >
                    <option value="active">Ativo (Permitir interações e vínculo)</option>
                    <option value="inactive">Inativo (Bloquear novas ações)</option>
                  </select>
                </div>

              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ marginTop: 0 }}
                  disabled={formLoading}
                >
                  {formLoading ? <span className="spinner" /> : 'Confirmar Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isConfirmDeleteOpen && clientToDelete && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🗑️</div>
            <h3 className="modal-title" style={{ justifyContent: 'center', marginBottom: '0.75rem' }}>
              Excluir Cliente
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Deseja realmente <strong>excluir permanentemente</strong> o cadastro de <strong>{clientToDelete.name}</strong>?<br />
              Esta ação não poderá ser desfeita e removerá os dados deste cliente da base do WiseMentor.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem', marginTop: '1.75rem' }}>
              <button
                onClick={() => {
                  setIsConfirmDeleteOpen(false)
                  setClientToDelete(null)
                }}
                className="btn-secondary"
                disabled={deleteLoading}
                style={{ width: 'auto', padding: '0 1.5rem' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="btn-primary"
                style={{ 
                  width: 'auto', 
                  padding: '0 1.5rem', 
                  marginTop: 0, 
                  background: '#ef4444', 
                  boxShadow: '0 4px 20px rgba(239, 68, 68, 0.35)' 
                }}
                disabled={deleteLoading}
              >
                {deleteLoading ? <span className="spinner" /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
