import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { ParsedProductVariant, ErrorLogItem } from './planilha1_parser'
import { GeneratedKitRow } from './planilha_marketplace_parser'

// Cabeçalhos Oficiais Multilinha do UpSeller para Produtos Únicos
const P2_EXACT_HEADERS = [
  'SKU*\n(Obrigatório, 1-200 caracteres e limite de números, letras e caracteres especiais）',
  'Título*\n(Obrigatório, 1-500 caracteres)',
  'Apelido do Produto\n(1-500 caracteres)',
  'Usar apelido como título da NFe',
  'Preço de varejo\n(limite 0-999999999)',
  'Custo de Compra\n(limite 0-999999999)',
  'Quantidade\n(limite 0-999999999, Se não for preenchido, não será registrado na Lista de Estoque)',
  'N° do Estante\n(Apenas estantes existentes, serão filtrados se o estante selecionado estiver cheio ou ficará cheio após a importação)',
  'Código de Barras\n(Limite de 8 a 14 caracteres, separe vários códigos de barras com vírgulas)',
  'Apelido de SKU\n（Limite a letras, números e caracteres especiais; separe vários apelidos de SKU com vírgulas; máximo de 20 entradas）',
  'Imagem',
  'Peso (g)\n(limite 1-999999)',
  'Comprimento (cm)\n(limite 1-999999)',
  'Largura (cm)\n(limite 1-999999)',
  'Altura (cm)\n(limite 1-999999)',
  'NCM\n(limite 8 dígitos)',
  'CEST\n(limite 7 dígitos)',
  'Unidade\n(Selecionar UN/KG/Par)',
  'Origem\n(Selecionar 0/1/2/3/4/5/6/7/8)',
  'Link do Fornecedor'
]

// Cabeçalhos Oficiais Multilinha do UpSeller para Produtos Variantes
const P3_EXACT_HEADERS = [
  'SPU*\n(Obrigatório, 1-200 caracteres e limite de números, letras e caracteres especiais)',
  'SKU*\n(Obrigatório, 1-200 caracteres e limite de números, letras e caracteres especiais)',
  'Título*\n(Obrigatório, 1-500 caracteres)',
  'Apelido do Produto\n(1-500 caracteres)',
  'Usar apelido como título da NFe',
  'Variantes1*\n(Obrigatório, 1-14 caracteres)',
  'Valor da Variante1*\n(Obrigatório, 1-30 caracteres)',
  'Variantes2\n(limite 1-14 caracteres)',
  'Valor da Variante2\n(limite 1-30 caracteres)',
  'Variantes3\n(limite 1-14 caracteres)',
  'Valor da Variante3\n(limite 1-30 caracteres)',
  'Variantes4\n(limite 1-14 caracteres)',
  'Valor da Variante4\n(limite 1-30 caracteres)',
  'Variantes5\n(limite 1-14 caracteres)',
  'Valor da Variante5\n(limite 1-30 caracteres)',
  'Preço de varejo\n(limite 0-999999999)',
  'Custo de Compra\n(limite 0-999999999)',
  'Quantidade\n(limite 0-999999999, Se não for preenchido, não será registrado na Lista de Estoque)',
  'N° do Estante\n(Apenas estantes existentes, serão filtrados se o estante selecionado estiver cheio ou ficará cheio após a importação)',
  'Código de Barras\n(Limite de 8 a 14 caracteres, separe vários códigos de barras com vírgulas)',
  'Apelido de SKU\n（Limite a letras, números e caracteres especiais; separe vários apelidos de SKU com vírgulas; máximo de 20 entradas）',
  'Imagem',
  'Peso (g)\n(limite 1-999999)',
  'Comprimento (cm)\n(limite 1-999999)',
  'Largura (cm)\n(limite 1-999999)',
  'Altura (cm)\n(limite 1-999999)',
  'NCM\n(limite 8 dígitos)',
  'CEST\n(limite 7 dígitos)',
  'Unidade\n(Selecionar UN/KG/Par)',
  'Origem\n(Selecionar 0/1/2/3/4/5/6/7/8)',
  'Link do Fornecedor'
]

// 1. Gerar Arquivo Excel de Produtos do Armazém (Únicos ou Variantes)
export function generateWarehouseExcel(
  products: ParsedProductVariant[],
  errors: ErrorLogItem[],
  isUnique: boolean
): ArrayBuffer {
  // Caminhos para carregar o arquivo modelo original
  const templateFileName = isUnique
    ? 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
    : 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'
  
  const publicTemplatePath = isUnique
    ? path.join(process.cwd(), 'public', 'templates', 'modelo_produtos_unicos.xlsx')
    : path.join(process.cwd(), 'public', 'templates', 'modelo_produtos_variantes.xlsx')

  const rootTemplatePath = path.join(process.cwd(), templateFileName)

  let wb: XLSX.WorkBook | null = null

  // Tentar carregar modelo existente no sistema
  try {
    if (fs.existsSync(rootTemplatePath)) {
      wb = XLSX.readFile(rootTemplatePath, { cellStyles: true })
    } else if (fs.existsSync(publicTemplatePath)) {
      wb = XLSX.readFile(publicTemplatePath, { cellStyles: true })
    }
  } catch (err) {
    console.warn('Modelo original de planilha não encontrado via fs, gerando com formatação idêntica:', err)
  }

  const sheetName = isUnique ? 'Import_Single_Template_BR01' : 'Import_Variants_Template_BR01'

  if (!wb) {
    wb = XLSX.utils.book_new()
  }

  // Preparar dados das linhas
  const rowsData: any[][] = [isUnique ? P2_EXACT_HEADERS : P3_EXACT_HEADERS]

  if (isUnique) {
    products.forEach(p => {
      rowsData.push([
        p.sku,               // SKU*
        p.title,             // Título*
        '',                  // Apelido do Produto
        'N',                 // Usar apelido como título da NFe
        0,                   // Preço de varejo
        p.costPrice || 0,    // Custo de Compra
        '',                  // Quantidade
        '',                  // N° do Estante
        '',                  // Código de Barras
        '',                  // Apelido de SKU
        p.imageUrl || '',    // Imagem
        1000,                // Peso (g)
        33,                  // Comprimento (cm)
        22,                  // Largura (cm)
        12,                  // Altura (cm)
        '',                  // NCM
        '',                  // CEST
        'UN',                // Unidade
        '0',                 // Origem
        ''                   // Link do Fornecedor
      ])
    })
  } else {
    products.forEach(p => {
      rowsData.push([
        p.spu,               // SPU*
        p.sku,               // SKU*
        p.title,             // Título*
        '',                  // Apelido do Produto
        'N',                 // Usar apelido como título da NFe
        'COR',               // Variantes1*
        p.color,             // Valor da Variante1*
        'TAMANHO',           // Variantes2
        p.size,              // Valor da Variante2
        '',                  // Variantes3
        '',                  // Valor da Variante3
        '',                  // Variantes4
        '',                  // Valor da Variante4
        '',                  // Variantes5
        '',                  // Valor da Variante5
        0,                   // Preço de varejo
        p.costPrice || 0,    // Custo de Compra
        '',                  // Quantidade
        '',                  // N° do Estante
        '',                  // Código de Barras
        '',                  // Apelido de SKU
        p.imageUrl || '',    // Imagem
        1000,                // Peso (g)
        33,                  // Comprimento (cm)
        22,                  // Largura (cm)
        12,                  // Altura (cm)
        '',                  // NCM
        '',                  // CEST
        'UN',                // Unidade
        '0',                 // Origem
        ''                   // Link do Fornecedor
      ])
    })
  }

  // Criar planilha principal mantendo o nome de aba oficial do UpSeller
  const wsMain = XLSX.utils.aoa_to_sheet(rowsData)
  
  // Garantir a substituição/inserção da aba de dados principal
  wb.Sheets[sheetName] = wsMain
  if (!wb.SheetNames.includes(sheetName)) {
    wb.SheetNames.unshift(sheetName)
  }

  // Garantir existência da aba 'Origin' para validação do UpSeller
  if (!wb.SheetNames.includes('Origin')) {
    const wsOrigin = XLSX.utils.aoa_to_sheet([['UpSeller Import Template']])
    XLSX.utils.book_append_sheet(wb, wsOrigin, 'Origin')
  }

  // Adicionar aba "Erros" de auditoria
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
  wb.Sheets['Erros'] = wsErrors
  if (!wb.SheetNames.includes('Erros')) {
    XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros')
  }

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
