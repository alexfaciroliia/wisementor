'use client'

import { useState, useEffect } from 'react'
import { getClientParameters, saveClientParameters } from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function ParametrosPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [loading, setLoading] = useState(false)

  // Estados de Parâmetros de Kits / Exceções
  const [kitKeywords, setKitKeywords] = useState<string>('kit, +, pack, combo, jogo')
  const [ignoreKeywords, setIgnoreKeywords] = useState<string>('conjunto')
  const [autoStandardize, setAutoStandardize] = useState<boolean>(true)

  // Estados de Credenciais do UpSeller
  const [upsellerEmail, setUpsellerEmail] = useState<string>('')
  const [upsellerPassword, setUpsellerPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [hasExistingConfig, setHasExistingConfig] = useState<boolean>(false)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!selectedClientId) return
    async function loadAllData() {
      setLoading(true)
      setMessage(null)

      // 1. Carregar Parâmetros de Palavras-Chave
      const params = await getClientParameters(selectedClientId)
      setKitKeywords(params.kit_keywords.join(', '))
      setIgnoreKeywords(params.ignore_keywords.join(', '))
      setAutoStandardize(params.auto_standardize_simples ?? true)

      // 2. Carregar Credenciais UpSeller
      try {
        const res = await fetch(`/api/automacao/settings?clientId=${selectedClientId}`)
        const data = await res.json()
        if (res.ok && data.settings) {
          setUpsellerEmail(data.settings.upseller_email || '')
          setUpsellerPassword('')
          setHasExistingConfig(true)
        } else {
          setUpsellerEmail('')
          setUpsellerPassword('')
          setHasExistingConfig(false)
        }
      } catch (err) {
        console.error('Erro ao carregar credenciais UpSeller:', err)
      } finally {
        setLoading(false)
      }
    }
    loadAllData()
  }, [selectedClientId])

  async function handleSave() {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Selecione um cliente ativo no menu lateral.' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      // 1. Salvar Parâmetros de Kits
      const kitArray = kitKeywords.split(',').map(s => s.trim()).filter(Boolean)
      const ignoreArray = ignoreKeywords.split(',').map(s => s.trim()).filter(Boolean)

      const resParams = await saveClientParameters({
        client_id: selectedClientId,
        kit_keywords: kitArray,
        ignore_keywords: ignoreArray,
        auto_standardize_simples: autoStandardize
      })

      if (!resParams.success) {
        throw new Error(resParams.error || 'Falha ao salvar palavras-chave.')
      }

      // 2. Salvar Credenciais UpSeller (se preenchido)
      if (upsellerEmail.trim()) {
        const resCreds = await fetch('/api/automacao/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: selectedClientId,
            upseller_email: upsellerEmail.trim(),
            upseller_password: upsellerPassword ? upsellerPassword.trim() : undefined
          })
        })

        if (!resCreds.ok) {
          const credData = await resCreds.json()
          throw new Error(credData.error || 'Falha ao salvar credenciais do UpSeller.')
        }
      }

      setMessage({ type: 'success', text: `Todos os parâmetros e credenciais do cliente ${selectedClient?.name} foram salvos com sucesso!` })
      setHasExistingConfig(true)
      setUpsellerPassword('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          ⚙️ Parâmetros & Configurações por Cliente
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Centralize aqui os gatilhos de **Kits**, termos de **Exceção (Conjuntos)** e as **Credenciais de Acesso ao UpSeller** do cliente ativo.
        </p>
      </div>

      {/* Card Form */}
      <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '2rem' }}>
        
        {/* Cliente Ativo Global */}
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
            Cliente Ativo (do Menu Lateral):
          </label>
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#1a1e2e',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            fontWeight: 600,
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            💼 {selectedClient ? selectedClient.name : 'Nenhum cliente selecionado'}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            <span className="spinner" style={{ width: '20px', height: '20px', marginBottom: '0.5rem' }} />
            <p>Carregando parâmetros do cliente...</p>
          </div>
        ) : (
          <>
            {/* SEÇÃO 1: REGRAS DE KITS E CONJUNTOS */}
            <div style={{ borderBottom: '1px solid #2a2e3d', paddingBottom: '1.75rem', marginBottom: '1.75rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎯 Regras de Negócio & Palavras-Chave
              </h2>

              {/* Gatilhos de Kits */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.4rem' }}>
                  Gatilhos de Identificação de Kits (separados por vírgula):
                </label>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Quando o título do anúncio contiver qualquer um desses termos (ex: "kit", "+", "pack"), ele será processado pelo motor de composição de Kits (Prompt 2).
                </p>
                <input
                  type="text"
                  value={kitKeywords}
                  onChange={e => setKitKeywords(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                />
              </div>

              {/* Termos de Exceções / Conjuntos */}
              <div style={{ marginBottom: '1.5rem' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="autoStd"
                  checked={autoStandardize}
                  onChange={e => setAutoStandardize(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="autoStd" style={{ fontSize: '0.9rem', color: '#cbd5e1', cursor: 'pointer' }}>
                  Padronizar automaticamente anúncios simples para os quais for encontrada correspondência direta de SKU no armazém.
                </label>
              </div>
            </div>

            {/* SEÇÃO 2: CREDENCIAIS UPSELLER */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔑 Credenciais de Acesso ao UpSeller
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>
                    E-mail da Conta UpSeller:
                  </label>
                  <input
                    type="email"
                    placeholder="usuario@upseller.com"
                    value={upsellerEmail}
                    onChange={e => setUpsellerEmail(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>
                    Senha da Conta UpSeller:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={hasExistingConfig ? '•••••••• (Inalterada)' : 'Digite a senha do UpSeller'}
                      value={upsellerPassword}
                      onChange={e => setUpsellerPassword(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
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
              {saving ? 'Salvando...' : '💾 Salvar Todos os Parâmetros'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
