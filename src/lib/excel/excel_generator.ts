import * as XLSX from 'xlsx'
import { ParsedProductVariant, ErrorLogItem } from './planilha1_parser'
import { GeneratedKitRow } from './planilha_marketplace_parser'

// 1. Gerar Arquivo Excel de Produtos do Armazém (Únicos ou Variantes)
export function generateWarehouseExcel(
  products: ParsedProductVariant[],
  errors: ErrorLogItem[],
  isUnique: boolean
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Cabeçalhos oficiais do UpSeller para Produtos
  const headers = [
    'SPU',
    'SKU',
    'Título',
    'Apelido do Produto',
    'Usar apelido como título da NFe',
    'Variante1',
    'Valor da Variante1',
    'Variante2',
    'Valor da Variante2',
    'Custo de Compra',
    'Imagem',
    'Peso',
    'Comprimento',
    'Largura',
    'Altura',
    'NCM',
    'CEST',
    'Unidade',
    'Origem',
    'Link do Fornecedor'
  ]

  const rowsData: any[][] = [headers]

  products.forEach(p => {
    rowsData.push([
      p.spu,
      p.sku,
      p.title,
      '', // Apelido
      'N',
      'COR',
      p.color,
      'TAMANHO',
      p.size,
      p.costPrice || 0,
      p.imageUrl || '',
      1000, // Peso
      33,   // Comprimento
      22,   // Largura
      12,   // Altura
      '',   // NCM
      '',   // CEST
      'UN', // Unidade
      '0',  // Origem
      ''    // Link Fornecedor
    ])
  })

  const mainSheetName = isUnique ? 'Produtos Unicos' : 'Produtos Variantes'
  const wsMain = XLSX.utils.aoa_to_sheet(rowsData)
  XLSX.utils.book_append_sheet(wb, wsMain, mainSheetName)

  // Aba "Erros"
  const errorHeaders = [
    'Tipo da ocorrência',
    'Linha da planilha do cliente',
    'Nome do produto',
    'Campo afetado',
    'Valor original',
    'Valor corrigido',
    'Mensagem',
    'Arquivo gerado',
    'Intervalo de linhas no arquivo do UpSeller'
  ]

  const errorRowsData: any[][] = [errorHeaders]
  errors.forEach(e => {
    errorRowsData.push([
      e.type,
      e.clientRow,
      e.productName,
      e.field,
      e.originalValue,
      e.correctedValue,
      e.message,
      e.generatedFile,
      e.upSellerLineRange
    ])
  })

  const wsErrors = XLSX.utils.aoa_to_sheet(errorRowsData)
  XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

// 2. Gerar Arquivo Excel Oficial de Importação de Kits (Prompt 2)
export function generateKitsExcel(
  kitRows: GeneratedKitRow[],
  errors: ErrorLogItem[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Aba principal "Formação dos Kits" (Exatamente 5 colunas)
  const kitHeaders = ['Kit SKU', 'Título', 'Imagem', 'SKU', 'SKU Qnt.']
  const kitRowsData: any[][] = [kitHeaders]

  kitRows.forEach(r => {
    kitRowsData.push([
      r.kitSku,
      r.title,
      r.imageUrl,
      r.sku,
      r.skuQty
    ])
  })

  const wsKits = XLSX.utils.aoa_to_sheet(kitRowsData)
  XLSX.utils.book_append_sheet(wb, wsKits, 'Formação dos Kits')

  // Aba "Erros"
  const errorHeaders = [
    'Tipo da ocorrência',
    'Linha da planilha de anúncios',
    'Identificador / Título do Anúncio',
    'Campo afetado',
    'Valor original',
    'Valor corrigido',
    'Mensagem',
    'Arquivo gerado',
    'Intervalo de linhas na planilha gerada'
  ]

  const errorRowsData: any[][] = [errorHeaders]
  errors.forEach(e => {
    errorRowsData.push([
      e.type,
      e.clientRow,
      e.productName,
      e.field,
      e.originalValue,
      e.correctedValue,
      e.message,
      e.generatedFile,
      e.upSellerLineRange
    ])
  })

  const wsErrors = XLSX.utils.aoa_to_sheet(errorRowsData)
  XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
