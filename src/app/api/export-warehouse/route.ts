import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'

// ── Cabeçalhos fiéis e exatos do UpSeller ────────────────────────────────────
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

// ── Cria a planilha em formato padrão sem estilização ad-hoc ──────────────────
function buildWorksheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  dataRows: any[][]
): void {
  const ws = wb.addWorksheet(sheetName)

  // Adiciona a linha 1 de cabeçalho (sem formatação especial)
  ws.addRow(headers)

  // Adiciona as linhas de dados fieis dos produtos (sem formatação especial)
  dataRows.forEach((values) => {
    ws.addRow(values)
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

    // ── Montar linhas de dados fieis ──────────────────────────────────────────
    const dataRows: any[][] = isUnique
      ? products.map((p) => [
          p.sku || '',                      // A: SKU*
          p.title || '',                    // B: Título*
          '',                               // C: Apelido do Produto
          'N',                              // D: Usar apelido como título da NFe
          0,                                // E: Preço de varejo
          Number(p.costPrice) || 0,         // F: Custo de Compra
          '',                               // G: Quantidade
          '',                               // H: N° do Estante
          '',                               // I: Código de Barras
          '',                               // J: Apelido de SKU
          p.imageUrl || '',                 // K: Imagem
          1000,                             // L: Peso (g)
          33,                               // M: Comprimento (cm)
          22,                               // N: Largura (cm)
          12,                               // O: Altura (cm)
          '',                               // P: NCM
          '',                               // Q: CEST
          'UN',                             // R: Unidade
          '0',                              // S: Origem
          ''                                // T: Link do Fornecedor
        ])
      : products.map((p) => [
          p.spu || '',                      // A: SPU*
          p.sku || '',                      // B: SKU*
          p.title || '',                    // C: Título*
          '',                               // D: Apelido do Produto
          'N',                              // E: Usar apelido como título da NFe
          'COR',                            // F: Variantes1*
          p.color || '',                    // G: Valor da Variante1*
          'TAMANHO',                        // H: Variantes2
          p.size || '',                     // I: Valor da Variante2
          '',                               // J: Variantes3
          '',                               // K: Valor da Variante3
          '',                               // L: Variantes4
          '',                               // M: Valor da Variante4
          '',                               // N: Variantes5
          '',                               // O: Valor da Variante5
          0,                                // P: Preço de varejo
          Number(p.costPrice) || 0,         // Q: Custo de Compra
          '',                               // R: Quantidade
          '',                               // S: N° do Estante
          '',                               // T: Código de Barras
          '',                               // U: Apelido de SKU
          p.imageUrl || '',                 // V: Imagem
          1000,                             // W: Peso (g)
          33,                               // X: Comprimento (cm)
          22,                               // Y: Largura (cm)
          12,                               // Z: Altura (cm)
          '',                               // AA: NCM
          '',                               // AB: CEST
          'UN',                             // AC: Unidade
          '0',                              // AD: Origem
          ''                                // AE: Link do Fornecedor
        ])

    // ── Construir workbook simples sem formatação ad-hoc ──────────────────────
    const wb = new ExcelJS.Workbook()

    // Aba principal com dados do cliente
    buildWorksheet(
      wb,
      sheetName,
      isUnique ? P2_HEADERS : P3_HEADERS,
      dataRows
    )

    // Aba 'Origin' — exigida pelo validador do UpSeller
    const wsOrigin = wb.addWorksheet('Origin')
    wsOrigin.addRow(['UpSeller Import Template'])

    // Aba 'Erros' — auditoria das ocorrências
    const wsErrors = wb.addWorksheet('Erros')
    wsErrors.addRow([
      'Tipo da ocorrência',
      'Linha da planilha do cliente',
      'Linha na planilha gerada',
      'Nome do produto',
      'Campo afetado',
      'Valor original',
      'Valor corrigido',
      'Mensagem',
      'Arquivo gerado'
    ])

    if (errors && errors.length > 0) {
      errors.forEach((e) => {
        wsErrors.addRow([
          e.type,
          e.clientRow,
          e.upSellerLineRange || '-',
          e.productName,
          e.field,
          e.originalValue,
          e.correctedValue,
          e.message,
          e.generatedFile
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
