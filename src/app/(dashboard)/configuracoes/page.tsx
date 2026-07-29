'use client'

import { useState, useEffect } from 'react'
import { useDashboard } from '../layout'
import {
  getClientParameters,
  saveClientParameters,
  getClientCategoryRules,
  saveClientCategoryRules,
  ClientParameter,
  ClientCategoryRule,
  fetchWarehouseProducts
} from '@/lib/services/product_service'

export default function ConfiguracoesPage() {
  const { profile, selectedClient, selectedClientId } = useDashboard()

  const [kitKeywords, setKitKeywords] = useState<string>('')
  const [ignoreKeywords, setIgnoreKeywords] = useState<string>('')
  const [categoryRules, setCategoryRules] = useState<ClientCategoryRule[]>([])
  
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Novo item de regra de categoria para adicionar
  const [newCatName, setNewCatName] = useState('')
  const [newCatKeywords, setNewCatKeywords] = useState('')
  const [newCatExclude, setNewCatExclude] = useState('')
  const [newCatSpuPattern, setNewCatSpuPattern] = useState('')
  const [newCatIsAccessory, setNewCatIsAccessory] = useState(true)

  useEffect(() => {
    if (!selectedClientId) return
    loadSettings(selectedClientId)
  }, [selectedClientId])

  async function loadSettings(clientId: string) {
    setLoading(true)
    setMessage(null)
    try {
      const params = await getClientParameters(clientId)
      setKitKeywords((params.kit_keywords || []).join(', '))
      setIgnoreKeywords((params.ignore_keywords || []).join(', '))

      const prods = await fetchWarehouseProducts(clientId)
      const rules = await getClientCategoryRules(clientId, prods)
      setCategoryRules(rules)
    } catch (err: any) {
      console.error('Erro ao carregar configurações:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSettings() {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Selecione um cliente ativo.' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const parsedKitKw = kitKeywords.split(',').map(k => k.trim()).filter(Boolean)
      const parsedIgnoreKw = ignoreKeywords.split(',').map(k => k.trim()).filter(Boolean)

      const paramRes = await saveClientParameters({
        client_id: selectedClientId,
        kit_keywords: parsedKitKw.length > 0 ? parsedKitKw : ['kit', '+', 'pack', 'combo'],
        ignore_keywords: parsedIgnoreKw.length > 0 ? parsedIgnoreKw : ['conjunto'],
        auto_standardize_simples: true
      })

      const ruleRes = await saveClientCategoryRules(selectedClientId, categoryRules)

      if (paramRes.success && ruleRes.success) {
        setMessage({ type: 'success', text: 'Configurações e Regras de Categorias salvas com sucesso!' })
      } else {
        setMessage({ type: 'error', text: ruleRes.error || paramRes.error || 'Erro ao salvar algumas configurações.' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Falha ao salvar: ${err.message || err}` })
    } finally {
      setSaving(false)
    }
  }

  function handleAddCategoryRule() {
    if (!newCatName.trim()) return

    const kwArray = newCatKeywords.split(',').map(k => k.trim()).filter(Boolean)
    const exArray = newCatExclude.split(',').map(k => k.trim()).filter(Boolean)
    const spuArray = newCatSpuPattern.split(',').map(k => k.trim()).filter(Boolean)

    const newRule: ClientCategoryRule = {
      client_id: selectedClientId || '',
      category_name: newCatName.trim(),
      keywords: kwArray.length > 0 ? kwArray : [newCatName.trim().toLowerCase()],
      exclude_keywords: exArray,
      spu_patterns: spuArray,
      is_accessory: newCatIsAccessory
    }

    setCategoryRules([...categoryRules, newRule])
    setNewCatName('')
    setNewCatKeywords('')
    setNewCatExclude('')
    setNewCatSpuPattern('')
    setNewCatIsAccessory(true)
  }

  function handleRemoveRule(index: number) {
    setCategoryRules(categoryRules.filter((_, idx) => idx !== index))
  }

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div className="content-header" style={{ marginBottom: '1.5rem' }}>
        <h2 className="content-title">Configurações & Regras do Cliente</h2>
        <p className="content-subtitle">
          Gerencie os parâmetros de Kits e as Regras Dinâmicas de Categorias de Produtos para {selectedClient?.name || 'o Cliente Selecionado'}.
        </p>
      </div>

      {message && (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: message.type === 'success' ? '#064e3b' : '#7f1d1d',
          color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${message.type === 'success' ? '#059669' : '#dc2626'}`
        }}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando parâmetros do cliente...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Seção 1: Parâmetros do Anúncio */}
          <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚙️ Parâmetros de Kits & Exceções do Cliente
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Termos que Identificam Anúncios de Kits (separados por vírgula):
                </label>
                <input
                  type="text"
                  value={kitKeywords}
                  onChange={e => setKitKeywords(e.target.value)}
                  placeholder="kit, +, pack, combo, jogo"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: '#1a1e2e',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '0.875rem'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
                  Anúncios contendo essas palavras ou o caractere '+' serão tratados como Kit.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Termos para Ignorar Padronização / Manter Pendente (separados por vírgula):
                </label>
                <input
                  type="text"
                  value={ignoreKeywords}
                  onChange={e => setIgnoreKeywords(e.target.value)}
                  placeholder="conjunto"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: '#1a1e2e',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '0.875rem'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
                  Anúncios contendo estes termos (ex: Conjunto) serão mantidos intactos sem alterar SKU.
                </span>
              </div>
            </div>
          </div>

          {/* Seção 2: Regras de Categorias e Sinônimos */}
          <div className="auth-card" style={{ maxWidth: '100%', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Regras Dinâmicas de Categorias & Sinônimos de Produtos
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
              Defina como cada tipo de produto deve ser reconhecido nos títulos e ordenado no Kit SKU (Acessório ou Produto Principal).
            </p>

            {/* Formulário para Adicionar Nova Regra */}
            <div style={{ background: '#131722', padding: '1.25rem', borderRadius: '10px', border: '1px solid #2a2e3d', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '1rem' }}>+ Adicionar Nova Regra de Categoria</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Nome da Categoria:</label>
                  <input
                    type="text"
                    placeholder="Ex: Relógio Analógico"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.8rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Palavras-Chave (Título):</label>
                  <input
                    type="text"
                    placeholder="relogio analogico, ponteiro"
                    value={newCatKeywords}
                    onChange={e => setNewCatKeywords(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.8rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Termos de Exclusão (Proibir):</label>
                  <input
                    type="text"
                    placeholder="digital"
                    value={newCatExclude}
                    onChange={e => setNewCatExclude(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.8rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Padrão SPU (Armazém):</label>
                  <input
                    type="text"
                    placeholder="REL-ANA"
                    value={newCatSpuPattern}
                    onChange={e => setNewCatSpuPattern(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.8rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Classificação no Kit SKU:</label>
                  <select
                    value={newCatIsAccessory ? 'accessory' : 'main'}
                    onChange={e => setNewCatIsAccessory(e.target.value === 'accessory')}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.8rem' }}
                  >
                    <option value="accessory">Acessório (Ordem Alfabética Primeiro)</option>
                    <option value="main">Produto Principal (Fica por ÚLTIMO)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddCategoryRule}
                disabled={!newCatName.trim()}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  background: newCatName.trim() ? '#8b5cf6' : '#334155',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: newCatName.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                + Adicionar Categoria
              </button>
            </div>

            {/* Tabela de Regras Existentes */}
            <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Categoria</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Palavras-Chave</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Exclusões</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Padrão SPU</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Classificação</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRules.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                        Nenhuma regra personalizada. O sistema utilizará o aprendizado automático dos produtos do armazém.
                      </td>
                    </tr>
                  ) : (
                    categoryRules.map((rule, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#e2e8f0' }}>{rule.category_name}</td>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#38bdf8' }}>{rule.keywords.join(', ')}</td>
                        <td style={{ padding: '0.65rem 1rem', color: '#f87171' }}>{rule.exclude_keywords?.join(', ') || '-'}</td>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#4ade80' }}>{rule.spu_patterns?.join(', ') || '-'}</td>
                        <td style={{ padding: '0.65rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: rule.is_accessory ? '#1e1b4b' : '#312e81',
                            color: rule.is_accessory ? '#c4b5fd' : '#a5b4fc'
                          }}>
                            {rule.is_accessory ? 'Acessório (Primeiro)' : 'Produto Principal (Último)'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}
                            title="Remover regra"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Botão de Salvar Tudo */}
          <div>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
                padding: '0.85rem 2rem',
                borderRadius: '8px',
                background: saving ? '#334155' : '#16a34a',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              {saving ? '⏳ Salvando...' : '💾 Salvar Parâmetros e Regras'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
