'use client'

import { useState, useEffect } from 'react'
import {
  getSupabaseProducts,
  createSupabaseProduct,
  updateSupabaseProduct,
  deleteSupabaseProduct,
  deleteAllWarehouseProducts,
  SupabaseProductItem
} from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function ArmazemanPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [dbProducts, setDbProducts] = useState<SupabaseProductItem[]>([])
  const [loadingDb, setLoadingDb] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dbMessage, setDbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SupabaseProductItem | null>(null)
  const [formData, setFormData] = useState({
    spu: '',
    sku: '',
    product_name: '',
    supplier: '',
    reference_model: '',
    color: '',
    size: '',
    cost_price: 0,
    image_url: ''
  })
  const [actionLoading, setActionLoading] = useState(false)

  // Carregar produtos quando o cliente selecionado mudar
  useEffect(() => {
    if (selectedClientId) {
      loadSupabaseProducts()
    } else {
      setDbProducts([])
    }
  }, [selectedClientId])

  async function loadSupabaseProducts() {
    if (!selectedClientId) return
    setLoadingDb(true)
    setDbMessage(null)
    try {
      const items = await getSupabaseProducts(selectedClientId)
      setDbProducts(items)
    } catch (err: any) {
      setDbMessage({ type: 'error', text: 'Erro ao carregar produtos do Supabase: ' + (err.message || err) })
    } finally {
      setLoadingDb(false)
    }
  }

  // CRUD Manutenção
  function openNewModal() {
    setEditingItem(null)
    setFormData({
      spu: '',
      sku: '',
      product_name: '',
      supplier: '',
      reference_model: '',
      color: '',
      size: '',
      cost_price: 0,
      image_url: ''
    })
    setIsModalOpen(true)
  }

  function openEditModal(item: SupabaseProductItem) {
    setEditingItem(item)
    setFormData({
      spu: item.spu || '',
      sku: item.sku || '',
      product_name: item.product_name || '',
      supplier: item.supplier || '',
      reference_model: item.reference_model || '',
      color: item.color || '',
      size: item.size || '',
      cost_price: item.cost_price || 0,
      image_url: item.image_url || ''
    })
    setIsModalOpen(true)
  }

  async function handleSaveProductForm(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClientId) {
      setDbMessage({ type: 'error', text: 'Selecione um cliente ativo no menu lateral.' })
      return
    }

    if (!formData.sku || !formData.product_name) {
      setDbMessage({ type: 'error', text: 'Os campos SKU e Nome do Produto são obrigatórios.' })
      return
    }

    setActionLoading(true)
    setDbMessage(null)

    try {
      if (editingItem) {
        // Atualizar
        const res = await updateSupabaseProduct(editingItem.id, {
          spu: formData.spu,
          sku: formData.sku,
          product_name: formData.product_name,
          supplier: formData.supplier,
          reference_model: formData.reference_model,
          color: formData.color,
          size: formData.size,
          cost_price: formData.cost_price,
          image_url: formData.image_url
        })
        if (res.success) {
          setDbMessage({ type: 'success', text: 'Produto atualizado com sucesso no Supabase!' })
          setIsModalOpen(false)
          loadSupabaseProducts()
        } else {
          setDbMessage({ type: 'error', text: `Erro ao atualizar: ${res.error}` })
        }
      } else {
        // Criar
        const res = await createSupabaseProduct({
          client_id: selectedClientId,
          spu: formData.spu || formData.sku,
          sku: formData.sku,
          product_name: formData.product_name,
          supplier: formData.supplier,
          reference_model: formData.reference_model,
          color: formData.color,
          size: formData.size,
          cost_price: formData.cost_price,
          image_url: formData.image_url
        })
        if (res.success) {
          setDbMessage({ type: 'success', text: 'Produto criado com sucesso no Supabase!' })
          setIsModalOpen(false)
          loadSupabaseProducts()
        } else {
          setDbMessage({ type: 'error', text: `Erro ao criar: ${res.error}` })
        }
      }
    } catch (err: any) {
      setDbMessage({ type: 'error', text: 'Erro ao salvar: ' + (err.message || err) })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDeleteProduct(id: string, name: string) {
    if (!confirm(`Tem certeza que deseja excluir o produto "${name}" do banco de dados?`)) return

    setActionLoading(true)
    setDbMessage(null)
    const res = await deleteSupabaseProduct(id)
    if (res.success) {
      setDbMessage({ type: 'success', text: 'Produto excluído com sucesso!' })
      loadSupabaseProducts()
    } else {
      setDbMessage({ type: 'error', text: `Erro ao excluir produto: ${res.error}` })
    }
    setActionLoading(false)
  }

  async function handleClearAll() {
    if (!selectedClientId || !selectedClient) return
    if (!confirm(`ATENÇÃO: Deseja realmente APAGAR TODOS os produtos salvos no armazém do cliente "${selectedClient.name}"? Esta ação não poderá ser desfeita.`)) return

    setActionLoading(true)
    setDbMessage(null)
    const res = await deleteAllWarehouseProducts(selectedClientId)
    if (res.success) {
      setDbMessage({ type: 'success', text: 'Armazém limpo com sucesso para este cliente!' })
      loadSupabaseProducts()
    } else {
      setDbMessage({ type: 'error', text: `Erro ao limpar armazém: ${res.error}` })
    }
    setActionLoading(false)
  }

  // Filtragem dos produtos da manutenção
  const filteredDbProducts = dbProducts.filter(p => {
    const term = searchTerm.toLowerCase()
    return (
      p.sku.toLowerCase().includes(term) ||
      p.spu.toLowerCase().includes(term) ||
      p.product_name.toLowerCase().includes(term) ||
      (p.supplier && p.supplier.toLowerCase().includes(term)) ||
      (p.color && p.color.toLowerCase().includes(term)) ||
      (p.size && p.size.toLowerCase().includes(term))
    )
  })

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          🗄️ Armazém do Supabase ({selectedClient ? selectedClient.name : 'Nenhum cliente selecionado'})
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Consulte, adicione, edite ou remova produtos salvos no armazém do Supabase para o cliente ativo selecionado.
        </p>
      </div>

      {/* Barra Superior de Ferramentas (Filtro, Novo Produto e Limpar Armazém) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '280px', maxWidth: '500px' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por SKU, SPU, Nome, Fornecedor ou Cor..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              background: '#131722',
              border: '1px solid #334155',
              color: '#fff',
              fontSize: '0.9rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={openNewModal}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              background: '#16a34a',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Novo Produto
          </button>

          {dbProducts.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={actionLoading}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                background: '#991b1b',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                cursor: actionLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              🗑️ Limpar Armazém
            </button>
          )}
        </div>
      </div>

      {/* Feedback de Mensagem do Banco */}
      {dbMessage && (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: dbMessage.type === 'success' ? '#064e3b' : '#7f1d1d',
          color: dbMessage.type === 'success' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${dbMessage.type === 'success' ? '#059669' : '#dc2626'}`
        }}>
          {dbMessage.text}
        </div>
      )}

      {/* Lista de Produtos do Banco de Dados */}
      {loadingDb ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#38bdf8' }}>
          Carregando produtos do banco Supabase...
        </div>
      ) : filteredDbProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#131722', borderRadius: '12px', border: '1px solid #2a2e3d', color: '#94a3b8' }}>
          {searchTerm ? 'Nenhum produto encontrado para a busca.' : 'Nenhum produto cadastrado no armazém do Supabase para este cliente.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#cbd5e1' }}>
            <thead>
              <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>SPU</th>
                <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                <th style={{ padding: '0.75rem 1rem' }}>Nome do Produto</th>
                <th style={{ padding: '0.75rem 1rem' }}>Fornecedor</th>
                <th style={{ padding: '0.75rem 1rem' }}>Cor</th>
                <th style={{ padding: '0.75rem 1rem' }}>Tamanho</th>
                <th style={{ padding: '0.75rem 1rem' }}>Custo</th>
                <th style={{ padding: '0.75rem 1rem' }}>Imagem</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredDbProducts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#38bdf8' }}>{p.spu}</td>
                  <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>{p.sku}</td>
                  <td style={{ padding: '0.65rem 1rem' }}>{p.product_name}</td>
                  <td style={{ padding: '0.65rem 1rem', color: '#94a3b8' }}>{p.supplier || '-'}</td>
                  <td style={{ padding: '0.65rem 1rem' }}>{p.color || '-'}</td>
                  <td style={{ padding: '0.65rem 1rem', color: '#fbbf24', fontWeight: 600 }}>{p.size || '-'}</td>
                  <td style={{ padding: '0.65rem 1rem' }}>R$ {Number(p.cost_price || 0).toFixed(2)}</td>
                  <td style={{ padding: '0.65rem 1rem' }}>
                    {p.image_url ? (
                      <a href={p.image_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Ver Foto</a>
                    ) : (
                      <span style={{ color: '#ef4444' }}>Sem link</span>
                    )}
                  </td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => openEditModal(p)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '4px',
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id, p.product_name)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '4px',
                          background: '#dc2626',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Criação e Edição de Produto */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1a1e2e',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '650px',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }}>
              {editingItem ? '✏️ Editar Produto no Armazém' : '➕ Adicionar Novo Produto ao Armazém'}
            </h2>

            <form onSubmit={handleSaveProductForm}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>SPU:</label>
                  <input
                    type="text"
                    value={formData.spu}
                    onChange={e => setFormData({ ...formData, spu: e.target.value })}
                    placeholder="Ex: MC-C10"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>SKU *:</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Ex: MC-C10-Preto-U"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Nome do Produto *:</label>
                <input
                  type="text"
                  required
                  value={formData.product_name}
                  onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                  placeholder="Ex: Cinto Dupla Face Couro Legítimo"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Fornecedor:</label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="Ex: MC"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Modelo de Referência:</label>
                  <input
                    type="text"
                    value={formData.reference_model}
                    onChange={e => setFormData({ ...formData, reference_model: e.target.value })}
                    placeholder="Ex: C10"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Cor:</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    placeholder="Ex: Preto"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Tamanho:</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={e => setFormData({ ...formData, size: e.target.value })}
                    placeholder="Ex: 27/28"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Custo (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>Link da Imagem (JPG/PNG/JPEG):</label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '6px', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '6px', background: '#16a34a', color: '#fff', border: 'none', cursor: actionLoading ? 'wait' : 'pointer', fontWeight: 600 }}
                >
                  {actionLoading ? 'Salvando...' : 'Salvar no Supabase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
