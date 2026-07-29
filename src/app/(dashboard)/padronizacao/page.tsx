'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { processMarketplaceListings, ParseMarketplaceResult, MarketplaceListingRow, GeneratedKitRow, ProcessedListingResult } from '@/lib/excel/planilha_marketplace_parser'
import { generateKitsExcel } from '@/lib/excel/excel_generator'
import { fetchWarehouseProducts, getClientParameters } from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function PadronizacaoPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [marketplace, setMarketplace] = useState<string>('mercado_livre')
  const [targetSpu, setTargetSpu] = useState<string>('')
  
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [resultData, setResultData] = useState<ParseMarketplaceResult | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  
  const [activeTab, setActiveTab] = useState<'kits' | 'conjuntos' | 'errors'>('kits')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  // Processar padronização de SKUs e formação de kits (Prompt 2)
  async function handleProcessMarketplaceSheet() {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Selecione um cliente ativo no menu lateral.' })
      return
    }
    if (!file) {
      setMessage({ type: 'error', text: 'Selecione a planilha de anúncios exportada do UpSeller.' })
      return
    }

    setProcessing(true)
    setMessage(null)

    try {
      // 1. Buscar parâmetros do cliente (palavras de kit e conjuntos)
      const params = await getClientParameters(selectedClientId)

      // 2. Buscar produtos oficiais cadastrados no Supabase para o cliente (e SPU se fornecido)
      const warehouseProducts = await fetchWarehouseProducts(selectedClientId, targetSpu)

      if (warehouseProducts.length === 0) {
        setMessage({
          type: 'warning',
          text: `Atenção: Nenhum produto cadastrado no armazém do Supabase${targetSpu ? ` para o SPU '${targetSpu}'` : ''}. Cadastre primeiro via Planilha 1.`
        })
      }

      // 3. Ler arquivo Excel dos Anúncios
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      const firstSheetName = wb.SheetNames[0]
      const worksheet = wb.Sheets[firstSheetName]
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (rawRows.length < 2) {
        setMessage({ type: 'error', text: 'A planilha de anúncios está vazia.' })
        setProcessing(false)
        return
      }

      // Detectar cabeçalhos dinamicamente com mapeamento para planilha real do UpSeller
      const headers = rawRows[0].map(h => String(h || '').trim())
      const headersLower = headers.map(h => h.toLowerCase())

      const findColIndex = (keywords: string[]) => {
        const idx = headersLower.findIndex(h => keywords.some(k => h.includes(k)))
        return idx
      }

      // Mapeamento específico para a exportação real do UpSeller
      // Colunas conhecidas na planilha UpSeller exportada:
      //   [4] E = ID do Anúncios
      //   [6] G = Título
      //   [32] AG = Opção por Variante1 (normalmente Cor)
      //   [34] AI = Opção por Variante2 (normalmente Tamanho)
      //   [41] AP = Imagem da Variante1
      let colId = findColIndex(['id do anúncios', 'id do anuncio', 'item id', 'id anúncio'])
      let colTitle = findColIndex(['título', 'titulo', 'nome do anúncio', 'title'])
      let colVariant1Name = findColIndex(['nome variante1', 'nome variante 1'])
      let colVariant1Val = findColIndex(['opção por variante1', 'opcao por variante1', 'opção variante1'])
      let colVariant2Name = findColIndex(['nome variante2', 'nome variante 2'])
      let colVariant2Val = findColIndex(['opção por variante2', 'opcao por variante2', 'opção variante2'])
      let colImg = findColIndex(['imagem da variante1', 'imagem variante1', 'url foto principal', 'foto principal'])
      let colStatus = findColIndex(['status', 'situação'])

      // Fallbacks para os índices fixos da planilha padrão UpSeller
      if (colId === -1)          colId = 4
      if (colTitle === -1)       colTitle = 6
      if (colVariant1Name === -1) colVariant1Name = 31
      if (colVariant1Val === -1)  colVariant1Val = 32
      if (colVariant2Name === -1) colVariant2Name = 33
      if (colVariant2Val === -1)  colVariant2Val = 34
      if (colImg === -1)         colImg = 41

      // Gerar relatório de diagnóstico
      const diagLines = [
        `📋 Planilha: ${firstSheetName}`,
        `📟 Total de linhas: ${rawRows.length - 1} (excl. cabeçalho)`,
        `🏷️ Coluna ID: [${colId}] = ${headers[colId] || '?'}`,
        `📝 Coluna Título: [${colTitle}] = ${headers[colTitle] || '?'}`,
        `🎨 Coluna Cor (Variante1 Valor): [${colVariant1Val}] = ${headers[colVariant1Val] || '?'}`,
        `📐 Coluna Tamanho (Variante2 Valor): [${colVariant2Val}] = ${headers[colVariant2Val] || '?'}`,
        `🖼️ Coluna Imagem: [${colImg}] = ${headers[colImg] || '?'}`,
        ``,
        `📊 PRIMEIRAS 5 LINHAS DE DADOS:`,
        ...rawRows.slice(1, 6).map((row, idx) => {
          const id = row[colId] ?? '—'
          const title = String(row[colTitle] ?? '').slice(0, 60)
          const v1n = row[colVariant1Name] ?? ''
          const v1v = row[colVariant1Val] ?? ''
          const v2n = row[colVariant2Name] ?? ''
          const v2v = row[colVariant2Val] ?? ''
          return `  Linha ${idx+2}: ID=[${id}] | T=[${title}] | ${v1n}=[${v1v}] | ${v2n}=[${v2v}]`
        })
      ]
      setDebugInfo(diagLines.join('\n'))

      const marketplaceRows: MarketplaceListingRow[] = []

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r]
        if (!row || row.length === 0) continue

        const titleVal = String(row[colTitle] !== undefined && row[colTitle] !== null ? row[colTitle] : '').trim()
        if (!titleVal) continue

        const idVal = String(row[colId] || `ROW-${r + 1}`).trim()
        const photoUrlVal = String(row[colImg] || '').trim()

        // Detectar qual variante é Cor e qual é Tamanho pelo nome da coluna
        const v1Name = String(row[colVariant1Name] || '').toLowerCase()
        const v2Name = String(row[colVariant2Name] || '').toLowerCase()
        let colorRaw: string | undefined
        let sizeRaw: string | undefined

        if (v1Name.includes('cor') || v1Name.includes('color')) {
          colorRaw = String(row[colVariant1Val] || '').trim() || undefined
          sizeRaw = String(row[colVariant2Val] || '').trim() || undefined
        } else if (v1Name.includes('tam') || v1Name.includes('size') || v1Name.includes('numero')) {
          sizeRaw = String(row[colVariant1Val] || '').trim() || undefined
          colorRaw = String(row[colVariant2Val] || '').trim() || undefined
        } else {
          // Fallback: Variante1 = Cor, Variante2 = Tamanho
          colorRaw = String(row[colVariant1Val] || '').trim() || undefined
          sizeRaw = String(row[colVariant2Val] || '').trim() || undefined
        }

        marketplaceRows.push({
          rowIdx: r + 1,
          listingId: idVal,
          title: titleVal,
          status: colStatus >= 0 ? String(row[colStatus] || 'ativo').trim() : 'ativo',
          colorRaw,
          sizeRaw,
          imageUrl: photoUrlVal || undefined,
          rawRowData: row
        })
      }

      // 4. Executar Motor de Padronização (Prompt 2)
      const res = processMarketplaceListings(
        marketplaceRows,
        warehouseProducts,
        targetSpu,
        params.kit_keywords,
        params.ignore_keywords
      )

      setResultData(res)
      setMessage({
        type: 'success',
        text: `Processamento concluído! ${res.allListings.filter(l => l.detectedType === 'kit').length} anúncios de Kit identificados → ${res.kitsRows.length} linhas geradas. ${res.allListings.filter(l => l.listingStatus === 'standardized' && l.detectedType === 'simple').length} simples | ${conjuntosList.length} Pendentes/Conjuntos.`
      })
      setShowDebug(false)

    } catch (err: any) {
      console.error('Erro no processamento de anúncios:', err)
      setMessage({ type: 'error', text: `Falha ao processar: ${err.message || err}` })
    } finally {
      setProcessing(false)
    }
  }

  // Baixar arquivo Excel de Kits para UpSeller (Planilha 5)
  function downloadKitsExcel() {
    if (!resultData) return
    const buffer = generateKitsExcel(resultData.kitsRows, resultData.errorLogs)
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = targetSpu.trim() ? `UpSeller_Importacao_Kits_${targetSpu.replace(/\s+/g, '_')}.xlsx` : 'Planilha_5_Modelo_Kit_UpSeller.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const kitsCount = resultData?.kitsRows.length || 0
  const conjuntosList = resultData?.allListings.filter(l => l.listingStatus === 'ignored_conjunto') || []
  const errorLogsList = resultData?.errorLogs || []

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          🎯 Mapeamento & Padronização de SKUs dos Marketplaces (Prompt 2)
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Importe as planilhas de anúncios do Mercado Livre/Marketplaces do UpSeller. O sistema localizará os SKUs oficiais no armazém do Supabase, formará os Kits (`KIT2-SPU-CORES-TAMANHO`), consolidará as quantidades e preservará anúncios de "Conjunto" como Pendentes.
        </p>
      </div>

      {/* Formulário de Configurações */}
      <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          
          {/* Cliente Ativo Global */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
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

          {/* Seleção do Marketplace */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              Marketplace de Origem:
            </label>
            <select
              value={marketplace}
              onChange={e => setMarketplace(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff' }}
            >
              <option value="mercado_livre">Mercado Livre</option>
              <option value="shopee">Shopee</option>
              <option value="shein">Shein</option>
              <option value="outro">Outro Marketplace</option>
            </select>
          </div>

          {/* SPU Oficial do Armazém */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              SPU Oficial do Produto no Armazém (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: AN-SAIDA-CALCA FAIXA (Deixe em branco para buscar todos)"
              value={targetSpu}
              onChange={e => setTargetSpu(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff' }}
            />
          </div>

          {/* File Input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              Planilha de Anúncios do UpSeller:
            </label>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', background: '#1a1e2e', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Botão de Processar */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={handleProcessMarketplaceSheet}
            disabled={processing}
            style={{
              padding: '0.75rem 1.75rem',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              cursor: processing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {processing ? 'Processando Padronização...' : '⚡ Processar Padronização & Formar Kits'}
          </button>
        </div>
      </div>

      {/* Alerta de Mensagem */}
      {message && (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: message.type === 'success' ? '#064e3b' : message.type === 'warning' ? '#78350f' : '#7f1d1d',
          color: message.type === 'success' ? '#6ee7b7' : message.type === 'warning' ? '#fde68a' : '#fca5a5',
          border: `1px solid ${message.type === 'success' ? '#059669' : message.type === 'warning' ? '#d97706' : '#dc2626'}`
        }}>
          {message.text}
        </div>
      )}

      {/* Resultados */}
      {resultData && (
        <>
          {/* Card de Estatísticas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
            <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #059669' }}>
              <span style={{ fontSize: '0.8rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Linhas de Kits Geradas</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', marginTop: '0.25rem' }}>{kitsCount}</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Aba 'Formação dos Kits'</span>
            </div>

            <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #d97706' }}>
              <span style={{ fontSize: '0.8rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Anúncios Pendentes (Conjuntos)</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>{conjuntosList.length}</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Preservados sem alterar SKU</span>
            </div>

            <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #dc2626' }}>
              <span style={{ fontSize: '0.8rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Erros & Ocorrências</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>{errorLogsList.length}</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Exportados na aba 'Erros'</span>
            </div>
          </div>

          {/* Botão de Download da Planilha UpSeller */}
          <div style={{ marginBottom: '2rem' }}>
            <button
              onClick={downloadKitsExcel}
              disabled={kitsCount === 0}
              style={{
                padding: '0.85rem 1.75rem',
                borderRadius: '8px',
                background: kitsCount > 0 ? '#16a34a' : '#334155',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                cursor: kitsCount > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              📥 Download Planilha Oficial UpSeller (Formação dos Kits + Aba Erros)
            </button>
          </div>

          {/* Navegação de Abas */}
          <div style={{ borderBottom: '1px solid #334155', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setActiveTab('kits')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'kits' ? '3px solid #34d399' : 'none',
                color: activeTab === 'kits' ? '#34d399' : '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Formação dos Kits ({kitsCount} linhas)
            </button>

            <button
              onClick={() => setActiveTab('conjuntos')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'conjuntos' ? '3px solid #fbbf24' : 'none',
                color: activeTab === 'conjuntos' ? '#fbbf24' : '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Pendentes / Conjuntos ({conjuntosList.length})
            </button>

            <button
              onClick={() => setActiveTab('errors')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'errors' ? '3px solid #f87171' : 'none',
                color: activeTab === 'errors' ? '#f87171' : '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Central de Erros ({errorLogsList.length})
            </button>
          </div>

          {/* Painel de Diagnóstico Debug */}
          {debugInfo && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => setShowDebug(!showDebug)}
                style={{ padding: '0.4rem 1rem', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', marginBottom: '0.5rem' }}
              >
                {showDebug ? '🔽 Ocultar' : '🔍 Ver'} Diagnóstico da Planilha Importada
              </button>
              {showDebug && (
                <pre style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '1rem', fontSize: '0.75rem', color: '#8b949e', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
                  {debugInfo}
                </pre>
              )}
            </div>
          )}

          {/* Conteúdo Aba Kits */}
          {activeTab === 'kits' && (
            <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>ID Anúncio</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Kit SKU</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Título do Anúncio</th>
                    <th style={{ padding: '0.75rem 1rem' }}>SKU Oficial Armazém</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>SKU Qnt.</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Imagem Kit</th>
                  </tr>
                </thead>
                <tbody>
                  {resultData.allListings
                    .filter(listing => listing.detectedType === 'kit' && listing.generatedKitRows.length > 0)
                    .flatMap(listing =>
                      listing.generatedKitRows.map((r, idx) => ({ ...r, listingId: listing.listingId, idx }))
                    )
                    .map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.8rem' }}>{r.listingId}</td>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>{r.kitSku}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>{r.title}</td>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#4ade80' }}>{r.sku}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 700, color: '#fbbf24' }}>{r.skuQty}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {r.imageUrl ? (
                          <a href={r.imageUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Ver Imagem</a>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conteúdo Aba Conjuntos */}
          {activeTab === 'conjuntos' && (
            <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>ID Anúncio</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Título Original</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status no Sistema</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Ação Recomendada</th>
                  </tr>
                </thead>
                <tbody>
                  {conjuntosList.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace' }}>{item.listingId}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{item.title}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#78350f', color: '#fde68a', fontWeight: 600, fontSize: '0.75rem' }}>
                          Pendente (Conjunto)
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#94a3b8' }}>Nenhuma alteração de SKU realizada. Tratar manualmente se necessário.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conteúdo Aba Erros */}
          {activeTab === 'errors' && (
            <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Linha</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Anúncio</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Campo</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Original</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Mensagem de Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {errorLogsList.map((e, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: e.type === 'ERRO' ? '#7f1d1d' : '#064e3b',
                          color: e.type === 'ERRO' ? '#fca5a5' : '#6ee7b7'
                        }}>
                          {e.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#94a3b8' }}>{e.clientRow}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{e.productName}</td>
                      <td style={{ padding: '0.65rem 1rem', color: '#38bdf8' }}>{e.field}</td>
                      <td style={{ padding: '0.65rem 1rem', color: '#f87171' }}>{e.originalValue || '-'}</td>
                      <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
