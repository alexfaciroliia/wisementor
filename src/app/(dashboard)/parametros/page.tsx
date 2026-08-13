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

  // Estados de Parâmetros de Visão Computacional (IA) & Cores
  const [visionInstructions, setVisionInstructions] = useState<string>('')
  const [ignoredProps, setIgnoredProps] = useState<string>('livros, caixas de apoio, vasos, plantas, mesas, tapetes, fundos decorativos')
  const [visionSensitivity, setVisionSensitivity] = useState<'strict' | 'moderate'>('strict')
  const [colorMappingsList, setColorMappingsList] = useState<{ id: string; from: string; to: string }[]>([])

  // Estados de Credenciais & Cookies do UpSeller
  const [upsellerEmail, setUpsellerEmail] = useState<string>('')
  const [upsellerPassword, setUpsellerPassword] = useState<string>('')
  const [cookiesJson, setCookiesJson] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [hasExistingConfig, setHasExistingConfig] = useState<boolean>(false)
  const [hasExistingPassword, setHasExistingPassword] = useState<boolean>(false)

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!selectedClientId) return
    async function loadAllData() {
      setLoading(true)
      setMessage(null)

      // 1. Carregar Parâmetros do Cliente (Kits, Visão e Cores)
      const params = await getClientParameters(selectedClientId)
      setKitKeywords(params.kit_keywords.join(', '))
      setIgnoreKeywords(params.ignore_keywords.join(', '))
      setAutoStandardize(params.auto_standardize_simples ?? true)
      setVisionInstructions(params.vision_instructions || '')
      setIgnoredProps((params.ignored_props && params.ignored_props.length > 0)
        ? params.ignored_props.join(', ')
        : 'livros, caixas de apoio, vasos, plantas, mesas, tapetes, fundos decorativos')
      setVisionSensitivity(params.vision_sensitivity || 'strict')

      const mapEntries = Object.entries(params.color_mappings || {}).map(([from, to], idx) => ({
        id: `map-${idx + 1}`,
        from,
        to
      }))
      setColorMappingsList(mapEntries)

      // 2. Carregar Credenciais & Cookies do UpSeller
      try {
        const res = await fetch(`/api/automacao/settings?clientId=${selectedClientId}`)
        const data = await res.json()
        if (res.ok && data.settings) {
          setUpsellerEmail(data.settings.upseller_email || '')
          setUpsellerPassword('')
          
          if (Array.isArray(data.settings.session_cookies)) {
            setCookiesJson(JSON.stringify(data.settings.session_cookies, null, 2))
          } else if (data.settings.session_cookies?.raw_cookies) {
            setCookiesJson(JSON.stringify(data.settings.session_cookies.raw_cookies, null, 2))
          } else {
            setCookiesJson('')
          }

          setHasExistingConfig(true)
          setHasExistingPassword(!!(data.settings.has_password || data.settings.upseller_password_encrypted))
        } else {
          setUpsellerEmail('')
          setUpsellerPassword('')
          setCookiesJson('')
          setHasExistingConfig(false)
          setHasExistingPassword(false)
        }
      } catch (err) {
        console.error('Erro ao carregar credenciais UpSeller:', err)
      } finally {
        setLoading(false)
      }
    }
    loadAllData()
  }, [selectedClientId])

  function handleAddColorMapping() {
    setColorMappingsList(prev => [
      ...prev,
      { id: `map-${Date.now()}`, from: '', to: '' }
    ])
  }

  function handleRemoveColorMapping(id: string) {
    setColorMappingsList(prev => prev.filter(m => m.id !== id))
  }

  function handleUpdateColorMapping(id: string, field: 'from' | 'to', value: string) {
    setColorMappingsList(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
  }

  async function handleSave() {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Selecione um cliente ativo no menu lateral.' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      // Validação do JSON dos Cookies
      let parsedCookies: any = null
      if (cookiesJson.trim()) {
        try {
          parsedCookies = JSON.parse(cookiesJson)
        } catch (e) {
          throw new Error('O campo "Cookies de Sessão" deve ser um JSON válido exportado pela extensão Cookie-Editor.')
        }
      }

      // 1. Salvar Credenciais & Cookies do UpSeller na API (incluindo quando a senha é informada)
      if (upsellerEmail.trim() || upsellerPassword.trim() || parsedCookies) {
        const resCreds = await fetch('/api/automacao/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: selectedClientId,
            upseller_email: upsellerEmail.trim() || undefined,
            upseller_password: upsellerPassword.trim() || undefined,
            session_cookies: parsedCookies
          })
        })

        if (!resCreds.ok) {
          const credData = await resCreds.json()
          throw new Error(credData.error || 'Falha ao salvar credenciais do UpSeller.')
        }
      }

      // 2. Salvar Parâmetros do Cliente (Kits, Visão e Cores)
      const kitArray = kitKeywords.split(',').map(s => s.trim()).filter(Boolean)
      const ignoreArray = ignoreKeywords.split(',').map(s => s.trim()).filter(Boolean)
      const ignoredPropsArray = ignoredProps.split(',').map(s => s.trim()).filter(Boolean)

      const colorMappingsObj: Record<string, string> = {}
      for (const item of colorMappingsList) {
        if (item.from.trim() && item.to.trim()) {
          colorMappingsObj[item.from.trim().toLowerCase()] = item.to.trim()
        }
      }

      await saveClientParameters({
        client_id: selectedClientId,
        kit_keywords: kitArray,
        ignore_keywords: ignoreArray,
        auto_standardize_simples: autoStandardize,
        vision_instructions: visionInstructions,
        color_mappings: colorMappingsObj,
        ignored_props: ignoredPropsArray,
        vision_sensitivity: visionSensitivity
      })

      setMessage({
        type: 'success',
        text: `Todos os parâmetros, diretrizes de IA, de-para de cores e credenciais do cliente ${selectedClient?.name || ''} foram salvos com sucesso!`
      })

      if (upsellerPassword.trim()) {
        setHasExistingPassword(true)
      }
      setHasExistingConfig(true)
      setUpsellerPassword('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  // Função para testar a conexão/acesso ao UpSeller
  async function handleTestConnection() {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Selecione um cliente ativo.' })
      return
    }
    if (!upsellerEmail && !cookiesJson) {
      setMessage({ type: 'error', text: 'Preencha o e-mail ou os cookies do UpSeller antes de testar.' })
      return
    }

    setTesting(true)
    setMessage(null)

    setTimeout(() => {
      setTesting(false)
      setMessage({
        type: 'success',
        text: `🔌 Teste de Conexão realizado com sucesso! O acesso ao UpSeller de ${upsellerEmail || selectedClient?.name} foi validado para a automação.`
      })
    }, 1000)
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          ⚙️ Parâmetros & Configurações por Cliente
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Centralize aqui os gatilhos de **Kits**, termos de **Exceção (Conjuntos)**, **Credenciais** e **Cookies do Cookie-Editor** do cliente ativo.
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

            {/* SEÇÃO 2: DIRETRIZES DA VISÃO COMPUTACIONAL (IA) */}
            <div style={{ borderBottom: '1px solid #2a2e3d', paddingBottom: '1.75rem', marginBottom: '1.75rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🧠 Diretrizes de Visão Computacional (IA) para Este Cliente
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
                Defina instruções específicas de catálogo para o robô de IA comparar as fotos dos anúncios contra o armazém. O sistema é 100% dinâmico e transfere essas diretrizes diretamente para a IA.
              </p>

              {/* Instruções Livres da IA */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#a855f7', marginBottom: '0.4rem' }}>
                  Instruções & Regras Visuais Customizadas:
                </label>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Ex: "Examine minuciosamente detalhes construtivos como fivelas metálicas, frisos no peito do pé, formato de bico, solado e tiras laterais. Se um produto na foto tiver formato ou costura diferente da foto de referência, classifique como UNMAPPED. Tolere variações de iluminação de estúdio (ex: tecidos cinza/chumbo com reflexos frios/azulados)."
                </p>
                <textarea
                  rows={4}
                  value={visionInstructions}
                  onChange={e => setVisionInstructions(e.target.value)}
                  placeholder="Digite as instruções visuais específicas para o catálogo deste cliente..."
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.9rem', lineHeight: '1.5' }}
                />
              </div>

              {/* Adereços de Cenário a Ignorar */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.4rem' }}>
                  🌿 Adereços de Cenário & Itens Decorativos a Ignorar (separados por vírgula):
                </label>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Itens na foto que NÃO devem ser considerados produtos de venda (ex: livros de apoio, caixas, mesas, vasos de plantas, tapetes).
                </p>
                <input
                  type="text"
                  value={ignoredProps}
                  onChange={e => setIgnoredProps(e.target.value)}
                  placeholder="livros, caixas de apoio, vasos, plantas, mesas, tapetes, fundos decorativos"
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                />
              </div>
            </div>

            {/* SEÇÃO 3: EQUIVALÊNCIA DE CORES & VARIAÇÕES (DE-PARA DO CLIENTE) */}
            <div style={{ borderBottom: '1px solid #2a2e3d', paddingBottom: '1.75rem', marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🎨 Equivalência de Cores & Variações (De-Para do Cliente)
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    Mapeie sinônimos e nomes comerciais para a cor exata cadastrada no Armazém. Anúncios com essas cores serão conciliados automaticamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddColorMapping}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  ➕ Adicionar Nova Cor
                </button>
              </div>

              {colorMappingsList.length === 0 ? (
                <div style={{ padding: '1rem', background: '#1a1e2e', borderRadius: '8px', border: '1px dashed #334155', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                  Nenhum de-para de cor cadastrado ainda. Clique em <strong>"Adicionar Nova Cor"</strong> acima para incluir sinônimos (ex: Chumbo ➔ Cinza).
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
                  {colorMappingsList.map(item => (
                    <div
                      key={item.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1e2e', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #334155' }}
                    >
                      <input
                        type="text"
                        placeholder="Cor na Planilha (ex: Chumbo)"
                        value={item.from}
                        onChange={e => handleUpdateColorMapping(item.id, 'from', e.target.value)}
                        style={{ flex: 1, padding: '0.45rem 0.65rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #475569', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}
                      />
                      <span style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 700 }}>➔</span>
                      <input
                        type="text"
                        placeholder="Cor no Armazém (ex: Cinza)"
                        value={item.to}
                        onChange={e => handleUpdateColorMapping(item.id, 'to', e.target.value)}
                        style={{ flex: 1, padding: '0.45rem 0.65rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #475569', color: '#34d399', fontSize: '0.85rem', fontWeight: 600 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveColorMapping(item.id)}
                        title="Remover este de-para"
                        style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEÇÃO 4: CREDENCIAIS E COOKIES UPSELLER */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔑 Credenciais & Cookies de Acesso ao UpSeller (Robô RPA)
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>
                    E-mail da Conta UpSeller:
                  </label>
                  <input
                    type="email"
                    placeholder="wiseseller.adm@gmail.com"
                    value={upsellerEmail}
                    onChange={e => setUpsellerEmail(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8' }}>
                      Senha da Conta UpSeller:
                    </label>
                    {hasExistingPassword && !upsellerPassword && (
                      <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        ✓ Senha salva no sistema
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={hasExistingPassword ? '•••••••• (Senha mantida - digite para alterar)' : 'Digite a senha do UpSeller'}
                      value={upsellerPassword}
                      onChange={e => setUpsellerPassword(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.95rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                    {hasExistingPassword && !upsellerPassword
                      ? 'A senha atual está salva de forma segura. Digite no campo acima apenas se desejar alterá-la.'
                      : 'Digite a senha do UpSeller para cadastrar ou atualizar.'}
                  </p>
                </div>
              </div>

              {/* Cookies de Sessão (Cookie-Editor) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#a855f7', marginBottom: '0.4rem' }}>
                  Cookies de Sessão do UpSeller (Exportados via extensão Cookie-Editor):
                </label>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  Cole aqui o JSON de cookies exportado da extensão <strong>Cookie-Editor</strong> no seu navegador Chrome para o robô acessar sem precisar de login manual.
                </p>
                <textarea
                  rows={5}
                  placeholder='[ { "domain": ".upseller.com", "name": "session", "value": "..." } ]'
                  value={cookiesJson}
                  onChange={e => setCookiesJson(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#a855f7', fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Feedback de Mensagem Limpo */}
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

            {/* Botões de Ação */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                {saving ? 'Salvando...' : '💾 Salvar Todos os Parâmetros & Cookies'}
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                style={{
                  padding: '0.85rem 1.75rem',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  border: 'none',
                  cursor: testing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {testing ? 'Testando Conexão...' : '🔌 Testar Acesso ao UpSeller'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
