'use client'

import { useState } from 'react'
import { parsePlanilha1, ParseResultPlanilha1, ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'
import { generateWarehouseExcel } from '@/lib/excel/excel_generator'
import { saveWarehouseProducts, saveErrorLogs } from '@/lib/services/product_service'
import { useDashboard } from '@/app/(dashboard)/layout'

export default function ProdutosPage() {
  const { selectedClient, selectedClientId } = useDashboard()

  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<ParseResultPlanilha1 | null>(null)
  const [activeTab, setActiveTab] = useState<'unique' | 'variant' | 'errors'>('variant')

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  // Baixar Planilha 2 (Produtos Únicos) com preservação total de formatação do modelo original
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

  // Baixar Planilha 3 (Produtos Variantes) com preservação total de formatação do modelo original
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

  // Auxiliar para download no navegador
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
        text: `Sucesso! ${res.savedCount} produtos foram salvos no armazém do Supabase para o cliente ${selectedClient?.name}.`
      })
    } else {
      setSaveMessage({ type: 'error', text: `Erro ao salvar no Supabase: ${res.error}` })
    }

    setSaving(false)
  }

  const totalUnique = parsedData?.uniqueProducts.length || 0
  const totalVariant = parsedData?.variantProducts.length || 0
  const totalErrors = parsedData?.errorLogs.length || 0

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: '0.5rem' }}>
          📦 Gestão & Ingestão da Planilha 1 (Produtos do Armazém)
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>
          Carregue a planilha bruta do cliente para processar as regras do **Prompt 1**, masculinizar cores, expandir tamanhos, classificar Produtos Únicos vs Variantes e gerar os modelos oficiais do UpSeller.
        </p>
      </div>

      {/* Card de Configuração & Upload */}
      <div className="card" style={{ background: '#131722', border: '1px solid #2a2e3d', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          
          {/* Cliente Ativo Global */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              Cliente Ativo (Selecionado no Menu Lateral):
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

          {/* Input do Arquivo */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
              Upload da Planilha 1 (.xlsx do Cliente):
            </label>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '8px',
                background: '#1a1e2e',
                border: '1px border #334155',
                color: '#fff',
                fontSize: '0.875rem'
              }}
            />
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
              {saving ? 'Gravando no Supabase...' : '💾 Salvar no Armazém do Supabase'}
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
            <ProductTable items={parsedData.variantProducts} />
          )}

          {/* Tabela de Produtos Únicos */}
          {activeTab === 'unique' && (
            <ProductTable items={parsedData.uniqueProducts} />
          )}

          {/* Tabela de Auditoria / Erros */}
          {activeTab === 'errors' && (
            <ErrorTable errors={parsedData.errorLogs} />
          )}
        </>
      )}
    </div>
  )
}

function ProductTable({ items }: { items: ParsedProductVariant[] }) {
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
                  <a href={item.imageUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Ver Foto</a>
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

function ErrorTable({ errors }: { errors: ErrorLogItem[] }) {
  if (errors.length === 0) {
    return <div style={{ color: '#22c55e', padding: '2rem', textAlign: 'center' }}>Nenhum erro ou inconsistência encontrado.</div>
  }

  return (
    <div style={{ overflowX: 'auto', background: '#131722', borderRadius: '10px', border: '1px solid #2a2e3d' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
        <thead>
          <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
            <th style={{ padding: '0.75rem 1rem' }}>Linha</th>
            <th style={{ padding: '0.75rem 1rem' }}>Produto</th>
            <th style={{ padding: '0.75rem 1rem' }}>Campo</th>
            <th style={{ padding: '0.75rem 1rem' }}>Original</th>
            <th style={{ padding: '0.75rem 1rem' }}>Ajustado</th>
            <th style={{ padding: '0.75rem 1rem' }}>Mensagem</th>
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
              <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{e.productName}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#38bdf8' }}>{e.field}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#f87171' }}>{e.originalValue || '-'}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#4ade80' }}>{e.correctedValue || '-'}</td>
              <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
