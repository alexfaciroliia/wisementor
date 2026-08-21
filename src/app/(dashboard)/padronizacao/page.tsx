'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import {
  processMarketplaceListingsWithVision,
  ParseMarketplaceResult,
  MarketplaceListingRow,
  GeneratedKitRow,
  ProcessedListingResult,
  DuplicateKitListingItem,
  VisionProcessingLog,
  WarehouseProductItem,
  ErrorCenterKitItem,
  orderKitSpus,
  findExactWarehouseSku,
  checkWarehouseColorSizeReconciliation,
  buildKitRowsForListing
} from '@/lib/excel/planilha_marketplace_parser'
import { removeAccentsAndCedilla } from '@/lib/excel/planilha1_parser'
import { generateKitsExcel } from '@/lib/excel/excel_generator'
import { fetchWarehouseProducts, getClientParameters, saveClientParameters, getClientCategoryRules, ClientCategoryRule } from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function PadronizacaoPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [marketplace, setMarketplace] = useState<string>('mercado_livre')
  const [targetSpu, setTargetSpu] = useState<string>('')
  
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [resultData, setResultData] = useState<ParseMarketplaceResult | null>(null)
  
  const [activeTab, setActiveTab] = useState<'kits' | 'errors' | 'duplicates'>('kits')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [visionProgress, setVisionProgress] = useState<{ current: number; total: number; listingId: string } | null>(null)
  const [visionLogs, setVisionLogs] = useState<VisionProcessingLog[]>([])

  // Busca e visualização de imagem (popup hover e modal click)
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredImg, setHoveredImg] = useState<{ url: string; x: number; y: number } | null>(null)
  const [modalImg, setModalImg] = useState<string | null>(null)
  
  // Mapeamento de De-para de cores e produtos manuais por anúncio
  const [selectedDePara, setSelectedDePara] = useState<{ [listingId: string]: string }>({})
  const [customKitSpus, setCustomKitSpus] = useState<{ [listingId: string]: string[] }>({})
  const [warehouseSearchPerListing, setWarehouseSearchPerListing] = useState<{ [listingId: string]: string }>({})

  const [currentWarehouseProducts, setCurrentWarehouseProducts] = useState<WarehouseProductItem[]>([])
  const [currentCategoryRules, setCurrentCategoryRules] = useState<ClientCategoryRule[]>([])
  const [showAuditLogs, setShowAuditLogs] = useState(false)

  // 1. Processar padronização de SKUs e formação de kits através de fotos
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

      // 2. Buscar produtos oficiais cadastrados no Supabase para o cliente e suas regras de categorias
      const warehouseProducts = await fetchWarehouseProducts(selectedClientId, targetSpu)
      const categoryRules = await getClientCategoryRules(selectedClientId, warehouseProducts)

      setCurrentWarehouseProducts(warehouseProducts)
      setCurrentCategoryRules(categoryRules)

      if (warehouseProducts.length === 0) {
        setMessage({
          type: 'warning',
          text: `Atenção: Nenhum produto cadastrado no armazém do sistema${targetSpu ? ` para o SPU '${targetSpu}'` : ''}. Cadastre primeiro via Importação da Planilha do Cliente.`
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

      // Detectar cabeçalhos dinamicamente
      const headers = rawRows[0].map(h => String(h || '').trim())
      const headersLower = headers.map(h => h.toLowerCase())

      const findColIndex = (keywords: string[]) => {
        const idx = headersLower.findIndex(h => keywords.some(k => h.includes(k)))
        return idx
      }

      let colId = findColIndex(['id do anúncios', 'id do anuncio', 'item id', 'id anúncio'])
      let colTitle = findColIndex(['título', 'titulo', 'nome do anúncio', 'title'])
      let colVariant1Name = findColIndex(['nome variante1', 'nome variante 1'])
      let colVariant1Val = findColIndex(['opção por variante1', 'opcao por variante1', 'opção variante1'])
      let colVariant2Name = findColIndex(['nome variante2', 'nome variante 2'])
      let colVariant2Val = findColIndex(['opção por variante2', 'opcao por variante2', 'opção variante2'])
      let colImg = findColIndex(['imagem da variante1', 'imagem variante1', 'url foto principal', 'foto principal'])
      let colStatus = findColIndex(['status', 'situação'])

      if (colId === -1)          colId = 4
      if (colTitle === -1)       colTitle = 6
      if (colVariant1Name === -1) colVariant1Name = 31
      if (colVariant1Val === -1)  colVariant1Val = 32
      if (colVariant2Name === -1) colVariant2Name = 33
      if (colImg === -1)         colImg = 41

      const marketplaceRows: MarketplaceListingRow[] = []

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r]
        if (!row || row.length === 0) continue

        const titleVal = String(row[colTitle] !== undefined && row[colTitle] !== null ? row[colTitle] : '').trim()
        if (!titleVal) continue

        const idVal = String(row[colId] || `ROW-${r + 1}`).trim()
        const photoUrlVal = String(row[colImg] || '').trim()

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

      // Função Vision que chama a API /api/vision/identify-kit
      const visionFn = async (imageUrl: string, products: WarehouseProductItem[], titleHint?: string) => {
        try {
          const res = await fetch('/api/vision/identify-kit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl,
              warehouseProducts: products,
              titleHint,
              clientVisionInstructions: params.vision_instructions,
              ignoredProps: params.ignored_props,
              visionSensitivity: params.vision_sensitivity
            })
          })
          if (!res.ok) return { identifiedSpus: [], totalItemsInPhoto: 0 }
          const data = await res.json()
          return {
            identifiedSpus: data.identifiedSpus || [],
            unmappedItems: data.unmappedItems || [],
            totalItemsInPhoto: data.totalItemsInPhoto || (data.identifiedSpus?.length || 0)
          }
        } catch {
          return { identifiedSpus: [], totalItemsInPhoto: 0 }
        }
      }

      setVisionProgress({ current: 0, total: 0, listingId: '' })

      const res = await processMarketplaceListingsWithVision(
        marketplaceRows,
        warehouseProducts,
        targetSpu,
        params.kit_keywords,
        params.ignore_keywords,
        visionFn,
        (current, total, listingId) => setVisionProgress({ current, total, listingId }),
        categoryRules,
        params.color_mappings
      )

      setVisionLogs(res.visionLogs || [])
      setVisionProgress(null)

      // Inicializar customKitSpus com os SPUs identificados inicialmente de cada item de erro
      const initialCustomSpus: { [listingId: string]: string[] } = {}
      if (res.errorCenterKits) {
        for (const item of res.errorCenterKits) {
          initialCustomSpus[item.listingId] = [...item.identifiedSpus]
        }
      }
      setCustomKitSpus(initialCustomSpus)

      setResultData(res)

      const kitsGenerated = res.kitsRows.length
      const errorCount = res.errorCenterKits?.length || 0
      const conjuntosCount = res.allListings.filter(l => l.listingStatus === 'ignored_conjunto').length

      setMessage({
        type: errorCount > 0 ? 'warning' : 'success',
        text: `Processamento concluído! ${kitsGenerated} linhas de kits formadas automaticamente. ${errorCount} anúncio(s) na Central de Erros necessitando conferência/ajuste manual. ${conjuntosCount} anúncio(s) de Conjunto preservados como Pendentes.`
      })

    } catch (err: any) {
      console.error('Erro no processamento de anúncios:', err)
      setMessage({ type: 'error', text: `Falha ao processar: ${err.message || err}` })
    } finally {
      setProcessing(false)
    }
  }

  // 2. Enviar manualmente um Kit da aba Formação dos Kits para a Central de Erros
  function handleSendToErrorCenter(listingId: string) {
    if (!resultData) return

    const listing = resultData.allListings.find(l => l.listingId === listingId)
    if (!listing) return

    // 1. Extrair SPUs previamente usados
    const usedSpus: string[] = []
    for (const r of listing.generatedKitRows) {
      const match = currentWarehouseProducts.find(p => p.sku === r.sku || (p.spu && r.sku.startsWith(p.spu)))
      if (match && !usedSpus.includes(match.spu.toUpperCase())) {
        usedSpus.push(match.spu.toUpperCase())
      }
    }

    // 2. Criar item na Central de Erros
    const errorItem: ErrorCenterKitItem = {
      listingId: listing.listingId,
      title: listing.title,
      cleanTitle: listing.cleanTitle,
      imageUrl: listing.generatedKitRows[0]?.imageUrl || '',
      statusMarketplace: listing.statusMarketplace || 'ativo',
      rows: (listing as any).rawRows || [
        {
          rowIdx: 1,
          listingId: listing.listingId,
          title: listing.title,
          status: listing.statusMarketplace || 'ativo',
          imageUrl: listing.generatedKitRows[0]?.imageUrl || ''
        }
      ],
      identifiedSpus: usedSpus,
      errorReason: 'manual_review',
      errorMessage: 'Kit enviado manualmente para a Central de Erros para revisão e identificação correta de produtos.',
      importedColors: [],
      importedSizes: [],
      availableColorsInWarehouse: Array.from(new Set(currentWarehouseProducts.map(p => p.color).filter(Boolean))),
      availableSizesInWarehouse: Array.from(new Set(currentWarehouseProducts.map(p => p.size).filter(Boolean)))
    }

    // 3. Remover linhas de kitsRows e atualizar status da listagem
    setResultData(prev => {
      if (!prev) return prev
      const newKitsRows = prev.kitsRows.filter(r => !listing.generatedKitRows.some(g => g.kitSku === r.kitSku && g.sku === r.sku && g.title === r.title))
      const newAllListings = prev.allListings.map(l => {
        if (l.listingId === listingId) {
          return {
            ...l,
            listingStatus: 'blocked_error' as const,
            generatedKitRows: []
          }
        }
        return l
      })

      const newErrorCenterKits = [...(prev.errorCenterKits || []).filter(e => e.listingId !== listingId), errorItem]

      return {
        ...prev,
        kitsRows: newKitsRows,
        allListings: newAllListings,
        errorCenterKits: newErrorCenterKits
      }
    })

    setCustomKitSpus(prev => ({
      ...prev,
      [listingId]: usedSpus
    }))

    setMessage({
      type: 'warning',
      text: `O anúncio "${listingId}" foi movido para a Central de Erros. Você pode selecionar manualmente os produtos correspondentes do armazém Supabase.`
    })
  }

  // 3. Adicionar SPU do Armazém ao Kit na Central de Erros
  function handleAddSpuToErrorKit(listingId: string, spu: string) {
    const cleanSpu = spu.trim().toUpperCase()
    if (!cleanSpu) return

    setCustomKitSpus(prev => {
      const current = prev[listingId] || []
      if (current.includes(cleanSpu)) return prev
      return {
        ...prev,
        [listingId]: [...current, cleanSpu]
      }
    })
  }

  // 4. Remover SPU do Kit na Central de Erros
  function handleRemoveSpuFromErrorKit(listingId: string, spuToRemove: string) {
    setCustomKitSpus(prev => {
      const current = prev[listingId] || []
      return {
        ...prev,
        [listingId]: current.filter(s => s !== spuToRemove)
      }
    })
  }

  // 5. Resolver Anúncio na Central de Erros e Mover de Volta para Formação dos Kits
  function handleResolveErrorKit(item: ErrorCenterKitItem) {
    if (!resultData) return

    const selectedSpus = customKitSpus[item.listingId] && customKitSpus[item.listingId].length > 0
      ? customKitSpus[item.listingId]
      : item.identifiedSpus

    if (selectedSpus.length === 0) {
      setMessage({
        type: 'error',
        text: `Selecione pelo menos 1 produto do armazém Supabase para compor o kit "${item.listingId}".`
      })
      return
    }

    const chosenColor = selectedDePara[item.listingId] || item.availableColorsInWarehouse[0]

    // Auto-aprendizado de De-Para de Cores: grava na parametrização do cliente para conciliar automaticamente nos próximos anúncios
    if (selectedClientId && item.importedColors && item.importedColors.length > 0 && selectedDePara[item.listingId]) {
      const impColor = item.importedColors[0].toLowerCase().trim()
      const targetColor = selectedDePara[item.listingId]
      getClientParameters(selectedClientId).then(params => {
        const updated = { ...(params.color_mappings || {}), [impColor]: targetColor }
        saveClientParameters({ ...params, client_id: selectedClientId, color_mappings: updated })
      }).catch(() => {})
    }

    // Gerar linhas do kit com as regras oficiais
    const { generatedRows, kitSku } = buildKitRowsForListing(
      item,
      selectedSpus,
      currentWarehouseProducts,
      currentCategoryRules,
      chosenColor
    )

    setResultData(prev => {
      if (!prev) return prev
      const newKitsRows = [...prev.kitsRows, ...generatedRows]
      const newErrorCenterKits = (prev.errorCenterKits || []).filter(e => e.listingId !== item.listingId)
      const newAllListings = prev.allListings.map(l => {
        if (l.listingId === item.listingId) {
          return {
            ...l,
            listingStatus: 'standardized' as const,
            kitSku,
            generatedKitRows: generatedRows
          }
        }
        return l
      })

      return {
        ...prev,
        kitsRows: newKitsRows,
        allListings: newAllListings,
        errorCenterKits: newErrorCenterKits
      }
    })

    setMessage({
      type: 'success',
      text: `Kit "${kitSku}" (${selectedSpus.join(' + ')}) formado com sucesso! Anúncio movido para a Formação dos Kits.`
    })
  }

  // 6. Baixar arquivo Excel de Kits para UpSeller (Planilha 5)
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
  const errorCenterKitsList = resultData?.errorCenterKits || []
  const errorLogsList = resultData?.errorLogs || []
  const duplicateListingsList = resultData?.duplicateListings || []

  // Lista única de produtos do armazém agrupada por SPU + Cor (excluindo duplicações de numerações)
  const uniqueWarehouseProducts = Array.from(
    currentWarehouseProducts.reduce((acc, prod) => {
      const spuKey = (prod.spu || '').trim().toUpperCase()
      const colorKey = (prod.color || '').trim().toUpperCase()
      const uniqueKey = `${spuKey}_${colorKey}`
      if (!acc.has(uniqueKey)) {
        acc.set(uniqueKey, prod)
      } else {
        const existing = acc.get(uniqueKey)!
        if (!existing.image_url && prod.image_url) {
          acc.set(uniqueKey, prod)
        }
      }
      return acc
    }, new Map<string, WarehouseProductItem>()).values()
  )

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          🎯 Padronização & Formação de Kits (UpSeller)
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          Importe a planilha de anúncios dos marketplaces exportada do UpSeller. O sistema compara as fotos dos anúncios estritamente com as fotos dos produtos cadastrados no armazém do sistema. Kits com identificação completa têm seus SKUs montados e vão para <strong>Formação dos Kits</strong>; kits com produtos faltantes ou divergentes vão para a <strong>Central de Erros</strong> para resolução interativa.
        </p>
      </div>

      {/* Card de Configurações e Ingestão */}
      <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>

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

          {/* SPU Oficial do Armazém (Opcional) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              SPU Específico no Armazém (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: i12 (Deixe em branco para carregar todos)"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#1a1e2e', border: '1px solid #334155', borderRadius: '8px', padding: '0.45rem 0.75rem' }}>
              <label style={{
                background: '#e2e8f0',
                color: '#0f172a',
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                userSelect: 'none',
                display: 'inline-block'
              }}>
                Escolher arquivo
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ fontSize: '0.875rem', color: file ? '#f1f5f9' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : 'Nenhum arquivo selecionado'}
              </span>
            </div>
          </div>
        </div>

        {/* Botão de Processar */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
            }}
          >
            {processing ? 'Comparando fotos com armazém...' : '⚡ Processar Padronização & Formar Kits'}
          </button>

          {/* Indicador de progresso */}
          {visionProgress && processing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #7c3aed' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #7c3aed', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#a78bfa', fontSize: '0.85rem', fontWeight: 600 }}>
                🔍 Analisando kit {visionProgress.current}/{visionProgress.total}
              </span>
              {visionProgress.listingId && (
                <span style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'monospace' }}>{visionProgress.listingId}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alerta de Mensagem */}
      {message && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: message.type === 'success' ? '#064e3b' : message.type === 'warning' ? '#78350f' : '#7f1d1d',
          color: message.type === 'success' ? '#6ee7b7' : message.type === 'warning' ? '#fde68a' : '#fca5a5',
          border: `1px solid ${message.type === 'success' ? '#059669' : message.type === 'warning' ? '#d97706' : '#dc2626'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Resultados e Navegação */}
      {resultData && (
        <>
          {/* Cards de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
            <div
              onClick={() => setActiveTab('kits')}
              style={{
                background: activeTab === 'kits' ? '#064e3b' : '#1e293b',
                padding: '1.25rem',
                borderRadius: '10px',
                border: '1px solid #059669',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Formação dos Kits</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', marginTop: '0.25rem' }}>{kitsCount}</div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Linhas prontas para exportação</span>
            </div>

            <div
              onClick={() => setActiveTab('errors')}
              style={{
                background: activeTab === 'errors' ? '#7f1d1d' : '#1e293b',
                padding: '1.25rem',
                borderRadius: '10px',
                border: '1px solid #dc2626',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Central de Erros</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>{errorCenterKitsList.length}</div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Kits com divergências ou incompletos</span>
            </div>

            <div
              onClick={() => setActiveTab('duplicates')}
              style={{
                background: activeTab === 'duplicates' ? '#4c1d95' : '#1e293b',
                padding: '1.25rem',
                borderRadius: '10px',
                border: '1px solid #8b5cf6',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Anúncios Duplicados</span>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#c084fc', marginTop: '0.25rem' }}>{duplicateListingsList.length}</div>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Mesmo SKU de outro anúncio (isolados)</span>
            </div>
          </div>

          {/* Download da Planilha Oficial UpSeller */}
          <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                gap: '0.6rem',
                boxShadow: kitsCount > 0 ? '0 4px 6px -1px rgba(22, 163, 74, 0.3)' : 'none'
              }}
            >
              📥 Download Planilha Oficial UpSeller ({kitsCount} linhas geradas)
            </button>
          </div>

          {/* Navegação de Abas Unificada (3 Abas) */}
          <div style={{ borderBottom: '1px solid #334155', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('kits')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'kits' ? '3px solid #34d399' : 'none',
                color: activeTab === 'kits' ? '#34d399' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer'
              }}
            >
              📦 Formação dos Kits ({kitsCount} linhas)
            </button>

            <button
              onClick={() => setActiveTab('errors')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'errors' ? '3px solid #f87171' : 'none',
                color: activeTab === 'errors' ? '#f87171' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              🚨 Central de Erros ({errorCenterKitsList.length})
            </button>

            <button
              onClick={() => setActiveTab('duplicates')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'duplicates' ? '3px solid #c084fc' : 'none',
                color: activeTab === 'duplicates' ? '#c084fc' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              📑 Duplicados ({duplicateListingsList.length})
            </button>
          </div>

          {/* Campo de Busca Geral */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '550px' }}>
              <input
                type="text"
                placeholder="🔍 Localizar por ID Anúncio, Kit SKU, Título, SKU Oficial..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.2rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  background: '#1a1e2e',
                  border: '1px solid #3b82f6',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#60a5fa' }}>🔍</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#334155',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>
            {searchTerm && (
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Filtrando por: <strong style={{ color: '#38bdf8' }}>"{searchTerm}"</strong>
              </span>
            )}
          </div>

          {/* ========================================================================= */}
          {/* ABA 1: FORMAÇÃO DOS KITS */}
          {/* ========================================================================= */}
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
                    <th style={{ padding: '0.75rem 1rem' }}>Foto do Kit</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {kitsCount === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        Nenhum kit formado ainda. Verifique a Central de Erros ou importe uma planilha com fotos idênticas ao armazém.
                      </td>
                    </tr>
                  ) : (
                    resultData.allListings
                      .filter(listing => listing.detectedType === 'kit' && listing.listingStatus === 'standardized' && listing.generatedKitRows.length > 0)
                      .flatMap(listing =>
                        listing.generatedKitRows.map((r, idx) => ({ ...r, listingId: listing.listingId, isFirstOfListing: idx === 0, countOfListing: listing.generatedKitRows.length }))
                      )
                      .filter(r => {
                        if (!searchTerm.trim()) return true
                        const norm = searchTerm.trim().toLowerCase()
                        return [r.listingId, r.kitSku, r.title, r.sku, r.skuQty].some(f => f !== undefined && String(f).toLowerCase().includes(norm))
                      })
                      .map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.8rem' }}>{r.listingId}</td>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>{r.kitSku}</td>
                        <td style={{ padding: '0.65rem 1rem', maxWidth: '300px' }}>{r.title}</td>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#4ade80', fontWeight: 600 }}>{r.sku}</td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 700, color: '#fbbf24' }}>{r.skuQty}</td>
                        <td style={{ padding: '0.65rem 1rem' }}>
                          {r.imageUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <img
                                src={r.imageUrl}
                                alt="Foto do Kit"
                                onClick={() => setModalImg(r.imageUrl)}
                                onMouseEnter={(e) => setHoveredImg({ url: r.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseMove={(e) => setHoveredImg({ url: r.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHoveredImg(null)}
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  objectFit: 'contain',
                                  background: '#fff',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  border: '1px solid #3b82f6',
                                  flexShrink: 0
                                }}
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setModalImg(r.imageUrl); }}
                                onMouseEnter={(e) => setHoveredImg({ url: r.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseMove={(e) => setHoveredImg({ url: r.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHoveredImg(null)}
                                style={{ background: 'none', border: 'none', color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: '0.8rem' }}
                              >
                                Ver Foto
                              </button>
                            </div>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleSendToErrorCenter(r.listingId)}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '6px',
                              background: '#7f1d1d',
                              border: '1px solid #dc2626',
                              color: '#fca5a5',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title="Enviar este anúncio para a Central de Erros para selecionar manualmente os produtos"
                          >
                            ⚠️ Enviar para Central de Erros
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: CENTRAL DE ERROS (UNIFICADA & INTERATIVA) */}
          {/* ========================================================================= */}
          {activeTab === 'errors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ background: '#1e293b', border: '1px solid #dc2626', borderRadius: '10px', padding: '1rem 1.25rem', color: '#fca5a5', fontSize: '0.9rem' }}>
                🚨 <strong>Central de Erros & Identificação Manual</strong>: Esta aba lista todos os kits onde o sistema não encontrou correspondência 100% idêntica para todos os produtos da foto, itens que possuem variações pendentes de de-para ou que foram enviados manualmente para correção. Selecione os produtos faltantes diretamente do armazém do sistema para formar o kit.
              </div>

              {errorCenterKitsList.length === 0 ? (
                <div style={{ padding: '3.5rem', textAlign: 'center', background: '#131722', borderRadius: '12px', border: '1px solid #059669' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
                  <h3 style={{ color: '#34d399', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Nenhum erro pendente!</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Todos os kits foram identificados com correspondência idêntica e estão prontos na aba <strong>Formação dos Kits</strong>.</p>
                </div>
              ) : (
                errorCenterKitsList
                  .filter(item => {
                    if (!searchTerm.trim()) return true
                    const norm = searchTerm.trim().toLowerCase()
                    return [item.listingId, item.title, item.errorMessage, (customKitSpus[item.listingId] || item.identifiedSpus).join(' ')].some(f => f !== undefined && String(f).toLowerCase().includes(norm))
                  })
                  .map((item, idx) => {
                    const activeSpus = customKitSpus[item.listingId] || item.identifiedSpus || []
                    const searchForThis = (warehouseSearchPerListing[item.listingId] || '').trim().toLowerCase()

                    const matchingWarehouseProds = !searchForThis
                      ? []
                      : uniqueWarehouseProducts.filter(p => {
                          return (p.spu || '').toLowerCase().includes(searchForThis) ||
                                 (p.product_name || '').toLowerCase().includes(searchForThis) ||
                                 (p.color || '').toLowerCase().includes(searchForThis) ||
                                 (p.sku || '').toLowerCase().includes(searchForThis)
                        })

                    return (
                      <div
                        key={idx}
                        style={{
                          background: '#131722',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          padding: '1.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.25rem',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                        }}
                      >
                        {/* Header do Card */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', fontSize: '0.95rem' }}>
                                ID Anúncio: {item.listingId}
                              </span>
                              <span style={{
                                padding: '0.2rem 0.6rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: item.errorReason === 'no_match' ? '#7f1d1d' :
                                            item.errorReason === 'incomplete_match' ? '#78350f' :
                                            item.errorReason === 'unmapped_items' ? '#831843' :
                                            item.errorReason === 'manual_review' ? '#3b0764' : '#1e3a8a',
                                color: item.errorReason === 'no_match' ? '#fca5a5' :
                                       item.errorReason === 'incomplete_match' ? '#fde68a' :
                                       item.errorReason === 'unmapped_items' ? '#fbcfe8' :
                                       item.errorReason === 'manual_review' ? '#e9d5ff' : '#93c5fd'
                              }}>
                                {item.errorReason === 'no_match' ? '🔴 Nenhum Produto Identificado' :
                                 item.errorReason === 'incomplete_match' ? '🟠 Identificação Parcial' :
                                 item.errorReason === 'unmapped_items' ? '🟡 Item Não Cadastrado' :
                                 item.errorReason === 'manual_review' ? '🟣 Revisão Manual' : '🔵 Variação Não Conciliada'}
                              </span>
                            </div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                              {item.title}
                            </h3>
                          </div>
                        </div>

                        {/* Corpo do Card com 2 colunas: Foto e Resolução */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
                          {/* Coluna da Imagem do Anúncio */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            {item.imageUrl ? (
                              <div
                                onClick={() => setModalImg(item.imageUrl)}
                                onMouseEnter={(e) => setHoveredImg({ url: item.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseMove={(e) => setHoveredImg({ url: item.imageUrl, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHoveredImg(null)}
                                style={{
                                  width: '100%',
                                  height: '200px',
                                  background: '#fff',
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '2px solid #3b82f6',
                                  transition: 'transform 0.2s, box-shadow 0.2s',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                                }}
                              >
                                <img
                                  src={item.imageUrl}
                                  alt="Foto do Anúncio"
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                              </div>
                            ) : (
                              <div style={{ width: '100%', height: '180px', background: '#1e293b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                Sem Imagem
                              </div>
                            )}
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>🔍 Passe o mouse ou clique para ampliar</span>
                          </div>

                          {/* Coluna de Ações e Seleção de Produtos */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Mensagem descritiva do erro */}
                            <div style={{ background: '#1e293b', padding: '0.75rem 1rem', borderRadius: '6px', borderLeft: '4px solid #f87171', color: '#cbd5e1', fontSize: '0.85rem' }}>
                              <strong>Diagnóstico:</strong> {item.errorMessage}
                            </div>

                            {/* SPUs atualmente atribuídos ao kit */}
                            <div>
                              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>
                                Componentes Selecionados para este Kit ({activeSpus.length}):
                              </label>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', minHeight: '38px' }}>
                                {activeSpus.length === 0 ? (
                                  <span style={{ color: '#f87171', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                    Nenhum produto selecionado. Adicione os produtos do armazém abaixo.
                                  </span>
                                ) : (
                                  activeSpus.map((spu, sIdx) => {
                                    const spuMatch = uniqueWarehouseProducts.find(p => p.spu.toUpperCase() === spu.toUpperCase())
                                    return (
                                      <div
                                        key={sIdx}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.4rem',
                                          padding: '0.35rem 0.75rem',
                                          borderRadius: '6px',
                                          background: '#1e3a8a',
                                          border: '1px solid #3b82f6',
                                          color: '#bfdbfe',
                                          fontWeight: 700,
                                          fontSize: '0.85rem'
                                        }}
                                      >
                                        {spuMatch?.image_url && (
                                          <img
                                            src={spuMatch.image_url}
                                            alt=""
                                            onClick={() => setModalImg(spuMatch.image_url!)}
                                            onMouseEnter={(e) => setHoveredImg({ url: spuMatch.image_url!, x: e.clientX, y: e.clientY })}
                                            onMouseMove={(e) => setHoveredImg({ url: spuMatch.image_url!, x: e.clientX, y: e.clientY })}
                                            onMouseLeave={() => setHoveredImg(null)}
                                            style={{ width: '20px', height: '20px', objectFit: 'contain', background: '#fff', borderRadius: '3px', cursor: 'pointer' }}
                                          />
                                        )}
                                        <span>📦 {spu}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveSpuFromErrorKit(item.listingId, spu)}
                                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', padding: '0 2px' }}
                                          title={`Remover ${spu}`}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>

                            {/* Seletor Interativo de Produtos do Armazém Supabase */}
                            <div style={{ background: '#1a1e2e', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                                  ➕ Localizar & Adicionar Produto do Armazém Supabase:
                                </label>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {uniqueWarehouseProducts.length} produtos cadastrados no armazém
                                </span>
                              </div>

                              <input
                                type="text"
                                placeholder="🔍 Digite o SPU, Nome ou SKU do produto..."
                                value={warehouseSearchPerListing[item.listingId] || ''}
                                onChange={e => setWarehouseSearchPerListing({ ...warehouseSearchPerListing, [item.listingId]: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: '6px',
                                  background: '#0f172a',
                                  border: '1px solid #3b82f6',
                                  color: '#fff',
                                  fontSize: '0.85rem',
                                  marginBottom: '0.75rem'
                                }}
                              />

                              {/* Lista de Produtos Encontrados no Armazém */}
                              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                                {!searchForThis ? (
                                  <div style={{ padding: '1.25rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', gridColumn: '1 / -1', background: '#0f172a', borderRadius: '6px', border: '1px dashed #334155' }}>
                                    💡 Digite o <strong>SPU, Nome ou SKU</strong> no campo acima para localizar e adicionar produtos do armazém.
                                  </div>
                                ) : matchingWarehouseProds.length === 0 ? (
                                  <div style={{ padding: '1.25rem', textAlign: 'center', color: '#f87171', fontSize: '0.85rem', gridColumn: '1 / -1', background: '#0f172a', borderRadius: '6px', border: '1px solid #7f1d1d' }}>
                                    Nenhum produto encontrado no armazém para "{warehouseSearchPerListing[item.listingId]}".
                                  </div>
                                ) : (
                                  matchingWarehouseProds.map((prod, pIdx) => {
                                    const isAlreadyAdded = activeSpus.includes(prod.spu.toUpperCase())
                                    return (
                                      <div
                                        key={pIdx}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          borderRadius: '6px',
                                          background: isAlreadyAdded ? '#1e293b' : '#0f172a',
                                          border: isAlreadyAdded ? '1px solid #059669' : '1px solid #1e293b',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: '0.5rem'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                          {prod.image_url ? (
                                            <img
                                              src={prod.image_url}
                                              alt={prod.product_name || prod.spu}
                                              onClick={() => setModalImg(prod.image_url!)}
                                              onMouseEnter={(e) => setHoveredImg({ url: prod.image_url!, x: e.clientX, y: e.clientY })}
                                              onMouseMove={(e) => setHoveredImg({ url: prod.image_url!, x: e.clientX, y: e.clientY })}
                                              onMouseLeave={() => setHoveredImg(null)}
                                              style={{ width: '36px', height: '36px', objectFit: 'contain', background: '#fff', borderRadius: '4px', cursor: 'pointer', border: '1px solid #334155', flexShrink: 0 }}
                                            />
                                          ) : (
                                            <div style={{ width: '36px', height: '36px', background: '#334155', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', flexShrink: 0 }}>📦</div>
                                          )}
                                          <div style={{ overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '2px' }}>
                                              <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                                                {prod.spu}
                                              </span>
                                              {prod.color && (
                                                <span style={{ fontSize: '0.7rem', background: '#334155', color: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                                                  {prod.color}
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {prod.product_name || prod.sku}
                                            </div>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isAlreadyAdded) {
                                              handleRemoveSpuFromErrorKit(item.listingId, prod.spu)
                                            } else {
                                              handleAddSpuToErrorKit(item.listingId, prod.spu)
                                            }
                                          }}
                                          style={{
                                            padding: '0.35rem 0.65rem',
                                            borderRadius: '4px',
                                            background: isAlreadyAdded ? '#7f1d1d' : '#16a34a',
                                            color: '#fff',
                                            border: 'none',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          {isAlreadyAdded ? '✓ Adicionado' : '+ Adicionar'}
                                        </button>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>

                            {/* De-Para de Cor (se houver variação de cor na planilha) */}
                            {item.availableColorsInWarehouse.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#1a1e2e', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                  🎨 Cor de Correspondência no Armazém:
                                </label>
                                <select
                                  value={selectedDePara[item.listingId] || item.availableColorsInWarehouse[0] || ''}
                                  onChange={e => setSelectedDePara({ ...selectedDePara, [item.listingId]: e.target.value })}
                                  style={{
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '6px',
                                    background: '#0f172a',
                                    border: '1px solid #3b82f6',
                                    color: '#4ade80',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {item.availableColorsInWarehouse.map((c, cIdx) => (
                                    <option key={cIdx} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Botão de Concluir Resolução */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                              <button
                                type="button"
                                onClick={() => handleResolveErrorKit(item)}
                                disabled={activeSpus.length === 0}
                                style={{
                                  padding: '0.75rem 1.5rem',
                                  borderRadius: '8px',
                                  background: activeSpus.length > 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#334155',
                                  color: '#fff',
                                  fontWeight: 700,
                                  fontSize: '0.9rem',
                                  border: 'none',
                                  cursor: activeSpus.length > 0 ? 'pointer' : 'not-allowed',
                                  boxShadow: activeSpus.length > 0 ? '0 4px 6px -1px rgba(16, 185, 129, 0.3)' : 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}
                              >
                                ✓ Confirmar & Mover para Formação dos Kits
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
              )}

              {/* Botão para visualizar tabela de logs de auditoria */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #2a2e3d', paddingTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAuditLogs(!showAuditLogs)}
                  style={{
                    background: 'none',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                >
                  {showAuditLogs ? '▲ Ocultar Tabela de Ocorrências (Auditoria)' : `▼ Ver Tabela de Ocorrências (${errorLogsList.length} registros)`}
                </button>

                {showAuditLogs && (
                  <div style={{ marginTop: '1rem', overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Linha</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Anúncio</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Campo</th>
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
                            <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 4: ANÚNCIOS DUPLICADOS (MESMO SKU) */}
          {activeTab === 'duplicates' && (
            <div style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📑 Anúncios Duplicados ({duplicateListingsList.length})
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem', lineHeight: '1.4' }}>
                    Estes anúncios geraram exatamente os mesmos SKUs de Kit que anúncios anteriores. O primeiro anúncio foi preservado na aba <strong>Formação dos Kits</strong> para exportação ao UpSeller, e os anúncios duplicados abaixo foram isolados nesta aba para evitar conflitos de SKUs repetidos na importação.
                  </p>
                </div>

                {/* Filtro de Busca */}
                <input
                  type="text"
                  placeholder="🔍 Buscar por ID ou Título..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '0.85rem',
                    minWidth: '260px'
                  }}
                />
              </div>

              {duplicateListingsList.length === 0 ? (
                <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✨</div>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#cbd5e1' }}>Nenhum anúncio duplicado encontrado</div>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Todos os anúncios processados geraram conjuntos de SKUs de kits únicos.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {duplicateListingsList
                    .filter(item => {
                      if (!searchTerm.trim()) return true
                      const term = searchTerm.toLowerCase()
                      return item.listingId.toLowerCase().includes(term) || item.title.toLowerCase().includes(term) || (item.duplicateOfListingId || '').toLowerCase().includes(term)
                    })
                    .map((item, idx) => (
                      <div
                        key={item.listingId || idx}
                        style={{
                          background: '#1a1e2e',
                          border: '1px solid #4c1d95',
                          borderRadius: '10px',
                          padding: '1.25rem',
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr',
                          gap: '1.25rem',
                          alignItems: 'center'
                        }}
                      >
                        {/* Foto do Anúncio Duplicado com Hover e Click */}
                        <div style={{ width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              onClick={() => setModalImg(item.imageUrl)}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setHoveredImg({ url: item.imageUrl, x: rect.right, y: rect.top })
                              }}
                              onMouseLeave={() => setHoveredImg(null)}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in', background: '#fff' }}
                            />
                          ) : (
                            <span style={{ fontSize: '1.5rem', color: '#64748b' }}>📷</span>
                          )}
                        </div>

                        {/* Detalhes do Anúncio Duplicado (Somente Informativo) */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: '#581c87',
                              color: '#e9d5ff',
                              border: '1px solid #7e22ce'
                            }}>
                              DUPLICADO
                            </span>
                            <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.95rem' }}>{item.listingId}</span>
                            <span style={{ fontSize: '0.8rem', color: '#f59e0b', background: '#451a03', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #78350f' }}>
                              ⚠️ Duplicado do anúncio original: <strong style={{ color: '#fbbf24' }}>{item.duplicateOfListingId}</strong>
                            </span>
                          </div>

                          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem', marginBottom: '0.35rem', lineHeight: '1.4' }}>
                            {item.title}
                          </div>

                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#94a3b8' }}>
                            {item.kitSku && (
                              <span>SKU do Kit: <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{item.kitSku}</strong></span>
                            )}
                            {item.generatedKitRows && item.generatedKitRows.length > 0 && (
                              <span>• Total de Variações: <strong style={{ color: '#e2e8f0' }}>{item.generatedKitRows.length} linhas</strong></span>
                            )}
                            <span style={{ color: '#a78bfa' }}>• Mantido apenas o anúncio original ({item.duplicateOfListingId}) na Formação dos Kits</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Popover flutuante no Hover da Imagem (Apenas a foto ampliada, sem textos sobrepostos) */}
      {hoveredImg && !modalImg && (
        <div style={{
          position: 'fixed',
          left: Math.min(hoveredImg.x + 15, typeof window !== 'undefined' ? window.innerWidth - 290 : 800),
          top: Math.max(10, Math.min(hoveredImg.y - 130, typeof window !== 'undefined' ? window.innerHeight - 290 : 600)),
          zIndex: 99999,
          pointerEvents: 'none',
          background: '#0f172a',
          border: '2px solid #3b82f6',
          borderRadius: '12px',
          padding: '0.35rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 10px 10px -5px rgba(0, 0, 0, 0.6)'
        }}>
          <img
            src={hoveredImg.url}
            alt=""
            style={{ width: '260px', height: '260px', objectFit: 'contain', borderRadius: '8px', background: '#fff', display: 'block' }}
          />
        </div>
      )}

      {/* Modal Popup ao Clicar na Imagem */}
      {modalImg && (
        <div
          onClick={() => setModalImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '1.5rem',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)'
            }}
          >
            <button
              type="button"
              onClick={() => setModalImg(null)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: '#334155',
                border: 'none',
                color: '#fff',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Fechar"
            >
              ✕
            </button>

            <img
              src={modalImg}
              alt="Visualização da Foto"
              style={{
                maxWidth: '80vw',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '10px',
                background: '#fff',
                padding: '0.5rem'
              }}
            />

            <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setModalImg(null)}
                style={{
                  padding: '0.6rem 1.5rem',
                  borderRadius: '8px',
                  background: '#ef4444',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ✕ Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


