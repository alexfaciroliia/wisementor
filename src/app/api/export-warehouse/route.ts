import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'

// ── Cabeçalhos exatos do UpSeller ────────────────────────────────────────────
const P2_HEADERS = [
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

const P3_HEADERS = [
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

// ── Estilo do cabeçalho idêntico ao modelo UpSeller (extraído das planilhas originais) ──
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF85D4E6' }
}
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: '微软雅黑',
  size: 10,
  bold: true,
  color: { argb: 'FF000000' }
}
const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true
}
const DATA_FONT: Partial<ExcelJS.Font> = {
  name: '微软雅黑',
  size: 10,
  color: { argb: 'FF000000' }
}

// ── Larguras das colunas — idênticas nas colunas equivalentes de P2 e P3 ────
// P2 usa as mesmas larguras que a P3 usa para as mesmas colunas funcionais.
const P2_COL_WIDTHS = [
  32.7522123893805,  // A: SKU*
  41,                // B: Título*            (= P3 col C)
  20.6637168141593,  // C: Apelido            (= P3 col D)
  22.1150442477876,  // D: NFe                (= P3 col E)
  18,                // E: Preço de varejo    (= P3 col P)
  18,                // F: Custo de Compra    (= P3 col Q)
  35.5044247787611,  // G: Quantidade         (= P3 col R)
  35.5044247787611,  // H: N° do Estante      (= P3 col S)
  26,                // I: Código de Barras   (= P3 col T)
  42.1150442477876,  // J: Apelido de SKU     (= P3 col U)
  14,                // K: Imagem             (= P3 col V)
  13,                // L: Peso (g)           (= P3 col W)
  19,                // M: Comprimento (cm)   (= P3 col X)
  16.3805309734513,  // N: Largura (cm)       (= P3 col Y)
  16,                // O: Altura (cm)        (= P3 col Z)
  13,                // P: NCM                (= P3 col AA)
  13,                // Q: CEST               (= P3 col AB)
  19,                // R: Unidade            (= P3 col AC)
  24,                // S: Origem             (= P3 col AD)
  26                 // T: Link do Fornecedor (= P3 col AE)
]

const P3_COL_WIDTHS = [
  32.7522123893805,  // A: SPU*
  32.7522123893805,  // B: SKU*
  41,                // C: Título*
  20.6637168141593,  // D: Apelido
  22.1150442477876,  // E: NFe
  24,                // F: Variantes1*
  24,                // G: Valor da Variante1*
  24,                // H: Variantes2
  24,                // I: Valor da Variante2
  24,                // J: Variantes3
  24,                // K: Valor da Variante3
  22,                // L: Variantes4
  25,                // M: Valor da Variante4
  23,                // N: Variantes5
  29,                // O: Valor da Variante5
  18,                // P: Preço de varejo
  18,                // Q: Custo de Compra
  35.5044247787611,  // R: Quantidade
  35.5044247787611,  // S: N° do Estante
  26,                // T: Código de Barras
  42.1150442477876,  // U: Apelido de SKU
  14,                // V: Imagem
  13,                // W: Peso (g)
  19,                // X: Comprimento (cm)
  16.3805309734513,  // Y: Largura (cm)
  16,                // Z: Altura (cm)
  13,                // AA: NCM
  13,                // AB: CEST
  19,                // AC: Unidade
  24,                // AD: Origem
  26                 // AE: Link do Fornecedor
]

// ── Cria a planilha do UpSeller do zero com exceljs ─────────────────────────
function buildWorksheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  colWidths: number[],
  dataRows: (string | number)[][]
): void {
  const ws = wb.addWorksheet(sheetName)

  // Aplicar larguras das colunas
  colWidths.forEach((width, i) => {
    ws.getColumn(i + 1).width = width
  })

  // Linha 1 — cabeçalho com estilo idêntico ao modelo UpSeller
  const headerRow = ws.addRow(headers)
  headerRow.height = 58.5
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = HEADER_ALIGNMENT
  })

  // Linhas de dados — produtos reais do cliente
  dataRows.forEach((values) => {
    const row = ws.addRow(values)
    row.height = 55.5
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = DATA_FONT
    })
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, products, errors }: {
      type: 'unique' | 'variant'
      products: ParsedProductVariant[]
      errors: ErrorLogItem[]
    } = body

    const isUnique = type === 'unique'
    const sheetName = isUnique ? 'Import_Single_Template_BR01' : 'Import_Variants_Template_BR01'

    // ── Montar linhas de dados reais ─────────────────────────────────────────
    const dataRows: (string | number)[][] = isUnique
      ? products.map((p) => [
          p.sku || '',          // A: SKU*
          p.title || '',        // B: Título*
          '',                   // C: Apelido do Produto
          'N',                  // D: Usar apelido como título da NFe
          0,                    // E: Preço de varejo
          p.costPrice || 0,     // F: Custo de Compra
          '',                   // G: Quantidade
          '',                   // H: N° do Estante
          '',                   // I: Código de Barras
          '',                   // J: Apelido de SKU
          p.imageUrl || '',     // K: Imagem
          1000,                 // L: Peso (g)
          33,                   // M: Comprimento (cm)
          22,                   // N: Largura (cm)
          12,                   // O: Altura (cm)
          '',                   // P: NCM
          '',                   // Q: CEST
          'UN',                 // R: Unidade
          '0',                  // S: Origem
          ''                    // T: Link do Fornecedor
        ])
      : products.map((p) => [
          p.spu || '',          // A: SPU*
          p.sku || '',          // B: SKU*
          p.title || '',        // C: Título*
          '',                   // D: Apelido do Produto
          'N',                  // E: Usar apelido como título da NFe
          'COR',                // F: Variantes1*
          p.color || '',        // G: Valor da Variante1*
          'TAMANHO',            // H: Variantes2
          p.size || '',         // I: Valor da Variante2
          '',                   // J: Variantes3
          '',                   // K: Valor da Variante3
          '',                   // L: Variantes4
          '',                   // M: Valor da Variante4
          '',                   // N: Variantes5
          '',                   // O: Valor da Variante5
          0,                    // P: Preço de varejo
          p.costPrice || 0,     // Q: Custo de Compra
          '',                   // R: Quantidade
          '',                   // S: N° do Estante
          '',                   // T: Código de Barras
          '',                   // U: Apelido de SKU
          p.imageUrl || '',     // V: Imagem
          1000,                 // W: Peso (g)
          33,                   // X: Comprimento (cm)
          22,                   // Y: Largura (cm)
          12,                   // Z: Altura (cm)
          '',                   // AA: NCM
          '',                   // AB: CEST
          'UN',                 // AC: Unidade
          '0',                  // AD: Origem
          ''                    // AE: Link do Fornecedor
        ])

    // ── Construir workbook do zero (sem depender de template em disco) ────────
    const wb = new ExcelJS.Workbook()

    // Aba principal com dados do cliente
    buildWorksheet(
      wb,
      sheetName,
      isUnique ? P2_HEADERS : P3_HEADERS,
      isUnique ? P2_COL_WIDTHS : P3_COL_WIDTHS,
      dataRows
    )

    // Aba 'Origin' — exigida pelo validador do UpSeller
    const wsOrigin = wb.addWorksheet('Origin')
    wsOrigin.addRow(['UpSeller Import Template'])

    // Aba 'Erros' — auditoria das ocorrências
    const wsErrors = wb.addWorksheet('Erros')
    const errorHeaderRow = wsErrors.addRow([
      'Tipo da ocorrência',
      'Linha da planilha do cliente',
      'Nome do produto',
      'Campo afetado',
      'Valor original',
      'Valor corrigido',
      'Mensagem',
      'Arquivo gerado',
      'Intervalo de linhas no arquivo do UpSeller'
    ])
    errorHeaderRow.font = { bold: true }

    if (errors && errors.length > 0) {
      errors.forEach((e) => {
        wsErrors.addRow([
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
    }

    // ── Gerar buffer e retornar ao cliente ────────────────────────────────────
    const outputBuffer = await wb.xlsx.writeBuffer()
    const outFileName = isUnique
      ? 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
      : 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'

    return new Response(outputBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(outFileName)}"`
      }
    })
  } catch (err: any) {
    console.error('Erro na API de exportação de produtos:', err)
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao gerar o arquivo Excel.' },
      { status: 500 }
    )
  }
}
