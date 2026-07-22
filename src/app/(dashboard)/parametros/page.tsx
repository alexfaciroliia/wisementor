'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClientParameters, saveClientParameters, ClientParameter } from '@/lib/services/product_service'

interface ClientOption {
  id: string
  name: string
}

export default function ParametrosPage() {
  const supabase = createClient()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [kitKeywords, setKitKeywords] = useState<string>('kit, +, pack, combo, jogo')
  const [ignoreKeywords, setIgnoreKeywords] = useState<string>('conjunto')
  const [autoStandardize, setAutoStandardize] = useState<boolean>(true)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase.from('clients').select('id, name').order('name')
      if (data && data.length > 0) {
        setClients(data)
        setSelectedClientId(data[0].id)
      }
      setLoading(false)
    }
    loadClients()
  }, [])

  useEffect(() => {
    if (!selectedClientId) return
    async function loadParams() {
      setLoading(true)
      const params = await getClientParameters(selectedClientId)
      setKitKeywords(params.kit_keywords.join(', '))
      setIgnoreKeywords(params.ignore_keywords.join(', '))
      setAutoStandardize(params.auto_standardize_simples ?? true)
      setLoading(false)
    }
    loadParams()
  }, [selectedClientId])

  async function handleSave() {
    if (!selectedClientId) return

    setSaving(true)
    setMessage(null)

    const kitArray = kitKeywords.split(',').map(s => s.trim()).filter(Boolean)
    const ignoreArray = ignoreKeywords.split(',').map(s => s.trim()).filter(Boolean)

    const res = await saveClientParameters({
      client_id: selectedClientId,
      kit_keywords: kitArray,
      ignore_keywords: ignoreArray,
      auto_standardize_simples: autoStandardize
    })

    if (res.success) {
      setMessage({ type: 'success', text: 'Parâmetros salvos com sucesso no Supabase!' })
    } else {
      setMessage({ type: 'error', text: `Erro ao salvar parâmetros: ${res.error}` })
    }

    setSaving(false)
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          ⚙️ Parametrização por Cliente
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Configure as regras específicas de identificação de **Kits** e **Exceções (Conjuntos)** para cada cliente do sistema.
        </p>
      </div>

      {/* Card Form */}
      <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '2rem' }}>
        
        {/* Seleção do Cliente */}
        <div style={{ marginBottom: '1.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
            Selecione o Cliente:
          </label>
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '1rem' }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Carregando parâmetros...</div>
        ) : (
          <>
            {/* Palavras-chave de Kits */}
            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.4rem' }}>
                Gatilhos de Identificação de Kits (separados por vírgula):
              </label>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                Quando o título do anúncio contiver qualquer um desses termos (ex: "kit", "+", "pack"), ele será processado pelo motor de composição de Kits.
              </p>
              <input
                type="text"
                value={kitKeywords}
                onChange={e => setKitKeywords(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
              />
            </div>

            {/* Palavras-chave de Exceções / Conjuntos */}
            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#fbbf24', marginBottom: '0.4rem' }}>
                Termos de Exceção a NÃO Padronizar (Mantidos como Pendentes):
              </label>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                Anúncios cujo título contiver esses termos (ex: "conjunto") **não terão o SKU alterado**, permanecendo no sistema como `Pendente`.
              </p>
              <input
                type="text"
                value={ignoreKeywords}
                onChange={e => setIgnoreKeywords(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
              />
            </div>

            {/* Auto-Padronizar Anúncios Simples */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="checkbox"
                id="autoStd"
                checked={autoStandardize}
                onChange={e => setAutoStandardize(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="autoStd" style={{ fontSize: '0.9rem', color: '#cbd5e1', cursor: 'pointer' }}>
                Padronizar automaticamente anúncios simples para os quais for encontrada correspondência direta de SKU.
              </label>
            </div>

            {/* Feedback de Mensagem */}
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

            {/* Botão de Salvar */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '0.85rem 2rem',
                borderRadius: '8px',
                background: '#16a34a',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer'
              }}
            >
              {saving ? 'Salvando...' : '💾 Salvar Parâmetros'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
