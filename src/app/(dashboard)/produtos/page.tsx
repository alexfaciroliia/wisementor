'use client'

import { useState, useEffect } from 'react'
import { parsePlanilha1, ParseResultPlanilha1, ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'
import { generateWarehouseExcel } from '@/lib/excel/excel_generator'
import {
  saveWarehouseProducts,
  saveErrorLogs,
  getSupabaseProducts,
  createSupabaseProduct,
  updateSupabaseProduct,
  deleteSupabaseProduct,
  deleteAllWarehouseProducts,
  SupabaseProductItem
} from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function ProdutosPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [mainTab, setMainTab] = useState<'ingestao' | 'database'>('ingestao')

  // Estados da Ingestão da Planilha 1
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<ParseResultPlanilha1 | null>(null)
  const [activeTab, setActiveTab] = useState<'unique' | 'variant' | 'errors'>('variant')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Estados do Gerenciamento do Armazém no Supabase (Manutenção CRUD)
  const [dbProducts, setDbProducts] = useState<SupabaseProductItem[]>([])
  const [loadingDb, setLoadingDb] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dbMessage, setDbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SupabaseProductItem | null>(null)
  
  // Visualização de imagem (popup hover e modal click)
  const [hoveredImg, setHoveredImg] = useState<{ url: string; x: number; y: number } | null>(null)
  const [modalImg, setModalImg] = useState<string | null>(null)

  // Modal de correção de erros/links na auditoria
  const [fixModalError, setFixModalError] = useState<{ errorIndex: number; item: ErrorLogItem } | null>(null)
  const [fixLinkInput, setFixLinkInput] = useState('')

  function handleOpenFixModal(errorIndex: number, item: ErrorLogItem) {
    setFixModalError({ errorIndex, item })
    setFixLinkInput(item.correctedValue || item.originalValue || '')
  }

  function handleApplyFix() {
    if (!fixModalError || !parsedData) return
    const newUrl = fixLinkInput.trim()
    if (!newUrl) return

    const { errorIndex, item } = fixModalError

    // 1. Atualizar log de erros
    const updatedLogs = [...parsedData.errorLogs]
    updatedLogs[errorIndex] = {
      ...item,
      type: 'CORRECAO',
      correctedValue: newUrl,
      message: `Link de imagem informado manualmente: ${newUrl}`
    }

    // 2. Atualizar todas as variantes com a linha correspondente
    const updateVariants = (list: ParsedProductVariant[]) => {
      return list.map(v => {
        if (v.clientRow === item.clientRow) {
          return { ...v, imageUrl: newUrl }
        }
        return v
      })
    }

    const updatedVariantProducts = updateVariants(parsedData.variantProducts)
    const updatedUniqueProducts = updateVariants(parsedData.uniqueProducts)

    setParsedData({
      ...parsedData,
      variantProducts: updatedVariantProducts,
      uniqueProducts: updatedUniqueProducts,
      errorLogs: updatedLogs
    })

    setFixModalError(null)
    setFixLinkInput('')
    setSaveMessage({ type: 'success', text: `Link da imagem corrigido com sucesso para a Linha ${item.clientRow}!` })
  }

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

  // Carregar produtos salvos no Supabase quando a aba 'database' for selecionada ou o cliente mudar
  useEffect(() => {
    if (mainTab === 'database' && selectedClientId) {
      loadSupabaseProducts()
    }
  }, [mainTab, selectedClientId])

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

  // Processar arquivo Excel ao selecionar
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setParsing(true)
    setSaveMessage(null)

    try {
      const arrayBuffer = await selectedFile.arrayBuffer()
      const result = parsePlanilha1(arrayBuffer)
      setParsedData(result)
      if (result.variantProducts.length > 0) {
        setActiveTab('variant')
      } else if (result.uniqueProducts.length > 0) {
        setActiveTab('unique')
      } else {
        setActiveTab('errors')
      }
    } catch (err: any) {
      console.error('Erro ao ler a planilha:', err)
      setSaveMessage({ type: 'error', text: `Erro ao ler planilha: ${err.message || err}` })
    } finally {
      setParsing(false)
    }
  }

  // Baixar Planilha 2 (Produtos Únicos)
  async function downloadUniqueExcel() {
    if (!parsedData) return
    try {
      const res = await fetch('/api/export-warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'unique',
          products: parsedData.uniqueProducts,
          errors: parsedData.errorLogs
        })
      })
      if (!res.ok) {
        const buffer = generateWarehouseExcel(parsedData.uniqueProducts, parsedData.errorLogs, true)
        blobDownload(buffer, 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const buffer = generateWarehouseExcel(parsedData.uniqueProducts, parsedData.errorLogs, true)
      blobDownload(buffer, 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx')
    }
  }

  // Baixar Planilha 3 (Produtos Variantes)
  async function downloadVariantExcel() {
    if (!parsedData) return
    try {
      const res = await fetch('/api/export-warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'variant',
          products: parsedData.variantProducts,
          errors: parsedData.errorLogs
        })
      })
      if (!res.ok) {
        const buffer = generateWarehouseExcel(parsedData.variantProducts, parsedData.errorLogs, false)
        blobDownload(buffer, 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const buffer = generateWarehouseExcel(parsedData.variantProducts, parsedData.errorLogs, false)
      blobDownload(buffer, 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx')
    }
  }

  function blobDownload(buffer: ArrayBuffer, filename: string) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Salvar no Supabase
  async function handleSaveToSupabase() {
    if (!selectedClientId) {
      setSaveMessage({ type: 'error', text: 'Selecione um cliente ativo no menu lateral.' })
      return
    }
    if (!parsedData) return

    setSaving(true)
    setSaveMessage(null)

    const allVariants = [...parsedData.uniqueProducts, ...parsedData.variantProducts]
    const res = await saveWarehouseProducts(selectedClientId, allVariants)

    if (res.success) {
      const batchId = crypto.randomUUID()
      await saveErrorLogs(selectedClientId, batchId, 'planilha_1_produtos', parsedData.errorLogs)
      setSaveMessage({
        type: 'success',
        text: `Sucesso! ${res.savedCount} produtos foram salvos/atualizados no armazém do sistema para o cliente ${selectedClient?.name}.`
      })
    } else {
      setSaveMessage({ type: 'error', text: `Erro ao salvar no armazém: ${res.error}` })
    }

    setSaving(false)
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

  const totalUnique = parsedData?.uniqueProducts.length || 0
  const totalVariant = parsedData?.variantProducts.length || 0
  const totalErrors = parsedData?.errorLogs.length || 0

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
            {mainTab === 'ingestao' ? '📦 Planilha do Cliente' : '📦 Produtos do Armazém do Sistema'}
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
            {mainTab === 'ingestao'
              ? "Carregue a planilha do cliente para iniciar a gestão de sku's"
              : 'Consulte, adicione, edite ou remova produtos salvos no armazém do sistema.'}
          </p>
        </div>
      </div>

      {/* Navegação por Abas Principais (Ingestão vs Armazém do Sistema) */}
      <div
        style={{
          display: 'inline-flex',
          background: '#131722',
          border: '1px solid #2a2e3d',
          borderRadius: '12px',
          padding: '5px',
          gap: '6px',
          marginBottom: '2rem'
        }}
      >
        <button
          type="button"
          onClick={() => setMainTab('ingestao')}
          style={{
            padding: '0.65rem 1.35rem',
            borderRadius: '8px',
            background: mainTab === 'ingestao' ? '#1e293b' : 'transparent',
            color: mainTab === 'ingestao' ? '#38bdf8' : '#94a3b8',
            fontWeight: mainTab === 'ingestao' ? 600 : 500,
            border: mainTab === 'ingestao' ? '1px solid #38bdf8' : '1px solid transparent',
            boxShadow: mainTab === 'ingestao' ? '0 4px 14px rgba(56, 189, 248, 0.15)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.925rem',
            transition: 'all 0.2s ease-in-out'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📤</span>
          <span>Planilha do Cliente</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('database')}
          style={{
            padding: '0.65rem 1.35rem',
            borderRadius: '8px',
            background: mainTab === 'database' ? '#1e293b' : 'transparent',
            color: mainTab === 'database' ? '#4ade80' : '#94a3b8',
            fontWeight: mainTab === 'database' ? 600 : 500,
            border: mainTab === 'database' ? '1px solid #4ade80' : '1px solid transparent',
            boxShadow: mainTab === 'database' ? '0 4px 14px rgba(74, 222, 128, 0.15)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.925rem',
            transition: 'all 0.2s ease-in-out'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📦</span>
          <span>Produtos do Armazém do Sistema</span>
        </button>
      </div>

      {/* ============================================================================================== */}
      {/* MODO 1: INGESTÃO E PROCESSAMENTO DE PLANILHA 1 */}
      {/* ============================================================================================== */}
      {mainTab === 'ingestao' && (
        <>
          {/* Card de Upload */}
          <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
            <div>
              {/* Input do Arquivo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
                  Upload da Planilha do Cliente (.xlsx do Cliente):
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
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span style={{ fontSize: '0.875rem', color: file ? '#f1f5f9' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file ? file.name : 'Nenhum arquivo selecionado'}
                  </span>
                </div>
              </div>
            </div>

            {parsing && (
              <div style={{ marginTop: '1rem', color: '#38bdf8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="spinner" style={{ width: '16px', height: '16px' }} />
                Processando planilha e aplicando regras do Prompt 1...
              </div>
            )}
          </div>

          {/* Resultados e Cards de Estatísticas */}
          {parsedData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Variações</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginTop: '0.25rem' }}>{totalUnique + totalVariant}</div>
                </div>

                <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #38bdf8' }}>
                  <span style={{ fontSize: '0.8rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Produtos Únicos</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.25rem' }}>{totalUnique}</div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>1 Cor + 1 Tamanho simultâneos</span>
                </div>

                <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #a855f7' }}>
                  <span style={{ fontSize: '0.8rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Produtos Variantes</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#c084fc', marginTop: '0.25rem' }}>{totalVariant}</div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>&gt;1 Cor ou &gt;1 Tamanho</span>
                </div>

                <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #f59e0b' }}>
                  <span style={{ fontSize: '0.8rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ocorrências / Erros</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>{totalErrors}</div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Registrados na aba 'Erros'</span>
                </div>
              </div>

              {/* Barra de Ações & Downloads */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  onClick={downloadUniqueExcel}
                  disabled={totalUnique === 0}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    background: totalUnique > 0 ? '#0284c7' : '#334155',
                    color: '#fff',
                    fontWeight: 600,
                    border: 'none',
                    cursor: totalUnique > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  📥 Baixar Planilha 2 (Produtos Únicos)
                </button>

                <button
                  onClick={downloadVariantExcel}
                  disabled={totalVariant === 0}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    background: totalVariant > 0 ? '#7e22ce' : '#334155',
                    color: '#fff',
                    fontWeight: 600,
                    border: 'none',
                    cursor: totalVariant > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  📥 Baixar Planilha 3 (Produtos Variantes)
                </button>

                <button
                  onClick={handleSaveToSupabase}
                  disabled={saving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    background: '#16a34a',
                    color: '#fff',
                    fontWeight: 600,
                    border: 'none',
                    cursor: saving ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginLeft: 'auto'
                  }}
                >
                  {saving ? 'Gravando no Armazém...' : '💾 Salvar no Armazém do Sistema'}
                </button>
              </div>

              {/* Feedback de Mensagem */}
              {saveMessage && (
                <div style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  background: saveMessage.type === 'success' ? '#064e3b' : '#7f1d1d',
                  color: saveMessage.type === 'success' ? '#6ee7b7' : '#fca5a5',
                  border: `1px solid ${saveMessage.type === 'success' ? '#059669' : '#dc2626'}`
                }}>
                  {saveMessage.text}
                </div>
              )}

              {/* Abas da Tabela de Resultados */}
              <div style={{ borderBottom: '1px solid #334155', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => setActiveTab('variant')}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'variant' ? '3px solid #c084fc' : 'none',
                    color: activeTab === 'variant' ? '#c084fc' : '#94a3b8',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Produtos Variantes ({totalVariant})
                </button>

                <button
                  onClick={() => setActiveTab('unique')}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'unique' ? '3px solid #38bdf8' : 'none',
                    color: activeTab === 'unique' ? '#38bdf8' : '#94a3b8',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Produtos Únicos ({totalUnique})
                </button>

                <button
                  onClick={() => setActiveTab('errors')}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'errors' ? '3px solid #fbbf24' : 'none',
                    color: activeTab === 'errors' ? '#fbbf24' : '#94a3b8',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Relatório de Erros & Auditoria ({totalErrors})
                </button>
              </div>

              {/* Tabela de Produtos Variantes */}
              {activeTab === 'variant' && (
                <ProductTable
                  items={parsedData.variantProducts}
                  onHover={(img, e) => setHoveredImg(img ? { url: img, x: e.clientX, y: e.clientY } : null)}
                  onClickImg={(img) => setModalImg(img)}
                />
              )}

              {/* Tabela de Produtos Únicos */}
              {activeTab === 'unique' && (
                <ProductTable
                  items={parsedData.uniqueProducts}
                  onHover={(img, e) => setHoveredImg(img ? { url: img, x: e.clientX, y: e.clientY } : null)}
                  onClickImg={(img) => setModalImg(img)}
                />
              )}

              {/* Tabela de Auditoria / Erros */}
              {activeTab === 'errors' && (
                <ErrorTable errors={parsedData.errorLogs} onFixError={handleOpenFixModal} />
              )}
            </>
          )}
        </>
      )}

      {/* ============================================================================================== */}
      {/* MODO 2: MANUTENÇÃO CRUD DOS PRODUTOS NO SUPABASE */}
      {/* ============================================================================================== */}
      {mainTab === 'database' && (
        <div>
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
              Carregando produtos do armazém do sistema...
            </div>
          ) : filteredDbProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: '#131722', borderRadius: '12px', border: '1px solid #2a2e3d', color: '#94a3b8' }}>
              {searchTerm ? 'Nenhum produto encontrado para a busca.' : 'Nenhum produto cadastrado no armazém do sistema para este cliente.'}
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <img
                              src={p.image_url}
                              alt=""
                              onClick={() => setModalImg(p.image_url!)}
                              onMouseEnter={(e) => setHoveredImg({ url: p.image_url!, x: e.clientX, y: e.clientY })}
                              onMouseMove={(e) => setHoveredImg({ url: p.image_url!, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredImg(null)}
                              style={{ width: '32px', height: '32px', objectFit: 'contain', background: '#fff', borderRadius: '4px', cursor: 'pointer', border: '1px solid #334155' }}
                            />
                            <button
                              type="button"
                              onClick={() => setModalImg(p.image_url!)}
                              onMouseEnter={(e) => setHoveredImg({ url: p.image_url!, x: e.clientX, y: e.clientY })}
                              onMouseMove={(e) => setHoveredImg({ url: p.image_url!, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredImg(null)}
                              style={{ background: 'none', border: 'none', color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: '0.8rem' }}
                            >
                              Ver Foto
                            </button>
                          </div>
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
                  {actionLoading ? 'Salvando...' : 'Salvar no Armazém'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Popover flutuante no Hover da Imagem */}
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

      {/* Modal Popup para Corrigir Link da Imagem na Auditoria */}
      {fixModalError && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '1.75rem',
            maxWidth: '540px',
            width: '100%',
            color: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', color: '#38bdf8' }}>
              ✏️ Corrigir Link de Imagem - Linha {fixModalError.item.clientRow}
            </h3>

            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem', border: '1px solid #1e293b' }}>
              <div style={{ color: '#cbd5e1', marginBottom: '0.35rem' }}>
                <strong>Produto:</strong> {fixModalError.item.productName || 'Não especificado'}
              </div>
              <div style={{ color: '#cbd5e1', marginBottom: '0.35rem' }}>
                <strong>Campo:</strong> <span style={{ color: '#38bdf8', fontWeight: 600 }}>{fixModalError.item.field}</span>
              </div>
              <div style={{ color: '#fca5a5', marginTop: '0.5rem', lineHeight: '1.4' }}>
                ⚠️ <strong>Ocorrência:</strong> {fixModalError.item.message}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                Informe a URL da imagem (JPG, JPEG ou PNG):
              </label>
              <input
                type="url"
                value={fixLinkInput}
                onChange={(e) => setFixLinkInput(e.target.value)}
                placeholder="https://exemplo.com/imagem.jpg"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #3b82f6',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem', display: 'block' }}>
                Ao salvar, todas as variações geradas desta linha receberão o link informado.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setFixModalError(null)}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  background: '#334155',
                  color: '#cbd5e1',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleApplyFix}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                💾 Salvar Correção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductTable({
  items,
  onHover,
  onClickImg
}: {
  items: ParsedProductVariant[]
  onHover?: (img: string | null, e: React.MouseEvent) => void
  onClickImg?: (img: string) => void
}) {
  if (items.length === 0) {
    return <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Nenhum produto nesta categoria.</div>
  }

  return (
    <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#cbd5e1' }}>
        <thead>
          <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem' }}>SPU</th>
            <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
            <th style={{ padding: '0.75rem 1rem' }}>Título / Nome</th>
            <th style={{ padding: '0.75rem 1rem' }}>Cor</th>
            <th style={{ padding: '0.75rem 1rem' }}>Tamanho</th>
            <th style={{ padding: '0.75rem 1rem' }}>Custo</th>
            <th style={{ padding: '0.75rem 1rem' }}>Imagem</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 150).map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', color: '#38bdf8' }}>{item.spu}</td>
              <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>{item.sku}</td>
              <td style={{ padding: '0.65rem 1rem' }}>{item.title}</td>
              <td style={{ padding: '0.65rem 1rem' }}>{item.color}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#fbbf24', fontWeight: 600 }}>{item.size}</td>
              <td style={{ padding: '0.65rem 1rem' }}>R$ {item.costPrice.toFixed(2)}</td>
              <td style={{ padding: '0.65rem 1rem' }}>
                {item.imageUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <img
                      src={item.imageUrl}
                      alt=""
                      onClick={() => onClickImg?.(item.imageUrl!)}
                      onMouseEnter={(e) => onHover?.(item.imageUrl!, e)}
                      onMouseMove={(e) => onHover?.(item.imageUrl!, e)}
                      onMouseLeave={(e) => onHover?.(null, e)}
                      style={{ width: '32px', height: '32px', objectFit: 'contain', background: '#fff', borderRadius: '4px', cursor: 'pointer', border: '1px solid #334155' }}
                    />
                    <button
                      type="button"
                      onClick={() => onClickImg?.(item.imageUrl!)}
                      onMouseEnter={(e) => onHover?.(item.imageUrl!, e)}
                      onMouseMove={(e) => onHover?.(item.imageUrl!, e)}
                      onMouseLeave={(e) => onHover?.(null, e)}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', fontSize: '0.8rem' }}
                    >
                      Ver Foto
                    </button>
                  </div>
                ) : (
                  <span style={{ color: '#ef4444' }}>Sem link</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > 150 && (
        <div style={{ padding: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
          Exibindo 150 de {items.length} itens. Todos serão exportados no arquivo Excel.
        </div>
      )}
    </div>
  )
}

function ErrorTable({ errors, onFixError }: { errors: ErrorLogItem[]; onFixError?: (idx: number, item: ErrorLogItem) => void }) {
  if (errors.length === 0) {
    return <div style={{ color: '#22c55e', padding: '2rem', textAlign: 'center' }}>Nenhum erro ou inconsistência encontrado.</div>
  }

  return (
    <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
        <thead>
          <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
            <th style={{ padding: '0.75rem 1rem' }}>Linha Cliente</th>
            <th style={{ padding: '0.75rem 1rem' }}>Linha Gerada</th>
            <th style={{ padding: '0.75rem 1rem' }}>Produto</th>
            <th style={{ padding: '0.75rem 1rem' }}>Campo</th>
            <th style={{ padding: '0.75rem 1rem' }}>Original</th>
            <th style={{ padding: '0.75rem 1rem' }}>Ajustado</th>
            <th style={{ padding: '0.75rem 1rem' }}>Mensagem</th>
            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '0.65rem 1rem' }}>
                <span style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: e.type === 'ERRO' ? '#7f1d1d' : e.type === 'CORRECAO' ? '#1e3a8a' : '#064e3b',
                  color: e.type === 'ERRO' ? '#fca5a5' : e.type === 'CORRECAO' ? '#93c5fd' : '#6ee7b7'
                }}>
                  {e.type}
                </span>
              </td>
              <td style={{ padding: '0.65rem 1rem', color: '#94a3b8' }}>{e.clientRow}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#38bdf8', fontWeight: 600 }}>{e.upSellerLineRange || '-'}</td>
              <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{e.productName}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#38bdf8' }}>{e.field}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#f87171' }}>{e.originalValue || '-'}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#4ade80', wordBreak: 'break-all', maxWidth: '200px' }}>{e.correctedValue || '-'}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{e.message}</td>
              <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                {onFixError && (
                  <button
                    type="button"
                    onClick={() => onFixError(idx, e)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    ✏️ Corrigir Link
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
