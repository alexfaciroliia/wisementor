import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'

// ── Estilo padrão do cabeçalho UpSeller (extraído do modelo original) ──────────
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF85D4E6' }   // azul claro UpSeller
}
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: '微软雅黑',                  // Microsoft YaHei (fonte do modelo)
  size: 10,
  bold: true,
  color: { argb: 'FF000000' }
}
const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true
}
const HEADER_ROW_HEIGHT = 58.5    // altura padrão (mesma para P2 e P3)
const DATA_FONT: Partial<ExcelJS.Font> = {
  name: '微软雅黑',
  size: 10,
  color: { argb: 'FF000000' }
}
const DATA_ROW_HEIGHT = 55.5

// ── Larguras das colunas da P2 alinhadas às colunas correspondentes da P3 ──────
// Garante que colunas com o mesmo significado tenham a mesma largura nas duas planilhas.
const P2_COL_WIDTHS: Record<string, number> = {
  A: 32.7522123893805,  // SKU*
  B: 41,                 // Título*            (= P3 col C)
  C: 20.6637168141593,  // Apelido            (= P3 col D)
  D: 22.1150442477876,  // Usar apelido NFe   (= P3 col E)
  E: 18,                 // Preço de varejo    (= P3 col P)
  F: 18,                 // Custo de Compra    (= P3 col Q)
  G: 35.5044247787611,  // Quantidade         (= P3 col R)
  H: 35.5044247787611,  // N° do Estante      (= P3 col S)
  I: 26,                 // Código de Barras   (= P3 col T)
  J: 42.1150442477876,  // Apelido de SKU     (= P3 col U)
  K: 14,                 // Imagem             (= P3 col V)
  L: 13,                 // Peso (g)           (= P3 col W)
  M: 19,                 // Comprimento (cm)   (= P3 col X)
  N: 16.3805309734513,  // Largura (cm)       (= P3 col Y)
  O: 16,                 // Altura (cm)        (= P3 col Z)
  P: 13,                 // NCM                (= P3 col AA)
  Q: 13,                 // CEST               (= P3 col AB)
  R: 19,                 // Unidade            (= P3 col AC)
  S: 24,                 // Origem             (= P3 col AD)
  T: 26                  // Link do Fornecedor (= P3 col AE)
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
    const templateFileName = isUnique
      ? 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
      : 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'

    // ── Localizar arquivo modelo ──────────────────────────────────────────────
    let templatePath = path.join(process.cwd(), templateFileName)
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(
        process.cwd(), 'public', 'templates',
        isUnique ? 'modelo_produtos_unicos.xlsx' : 'modelo_produtos_variantes.xlsx'
      )
    }
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: 'Arquivo modelo oficial do UpSeller não encontrado no servidor.' },
        { status: 500 }
      )
    }

    // ── Ler template com exceljs (preserva estilos reais) ────────────────────
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(templatePath)

    const ws = wb.getWorksheet(sheetName)
    if (!ws) {
      return NextResponse.json(
        { error: `Aba ${sheetName} não encontrada no modelo original.` },
        { status: 500 }
      )
    }

    // ── Remover linhas de dados de exemplo (linha 2 em diante) ───────────────
    const dataRowCount = ws.rowCount - 1
    if (dataRowCount > 0) {
      ws.spliceRows(2, dataRowCount)
    }

    // ── Reforçar estilo do cabeçalho (linha 1) ────────────────────────────────
    // Garante visual idêntico entre P2 e P3 independente do modelo de origem.
    const headerRow = ws.getRow(1)
    headerRow.height = HEADER_ROW_HEIGHT
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.fill = HEADER_FILL
      cell.font = HEADER_FONT
      cell.alignment = HEADER_ALIGNMENT
    })

    // ── Ajustar larguras das colunas da P2 para coincidir com a P3 ───────────
    if (isUnique) {
      Object.entries(P2_COL_WIDTHS).forEach(([letter, width]) => {
        ws.getColumn(letter).width = width
      })
    }

    // ── Preencher dados dos produtos ──────────────────────────────────────────
    const addDataRow = (values: (string | number)[]) => {
      const row = ws.addRow(values)
      row.height = DATA_ROW_HEIGHT
      row.eachCell({ includeEmpty: false }, (cell) => { cell.font = DATA_FONT })
      return row
    }

    if (isUnique) {
      products.forEach((p) => {
        addDataRow([
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
      })
    } else {
      products.forEach((p) => {
        addDataRow([
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
      })
    }

    // ── Aba de Erros ──────────────────────────────────────────────────────────
    const existingErrors = wb.getWorksheet('Erros')
    if (existingErrors) wb.removeWorksheet(existingErrors.id)

    const wsErrors = wb.addWorksheet('Erros')
    wsErrors.addRow([
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

    // ── Gerar buffer e retornar ───────────────────────────────────────────────
    const outputBuffer = await wb.xlsx.writeBuffer()
    const outFileName = templateFileName

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
