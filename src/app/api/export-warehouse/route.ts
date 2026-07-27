import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, products, errors }: { type: 'unique' | 'variant'; products: ParsedProductVariant[]; errors: ErrorLogItem[] } = body

    const isUnique = type === 'unique'
    const fileName = isUnique
      ? 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
      : 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'
    
    const sheetName = isUnique ? 'Import_Single_Template_BR01' : 'Import_Variants_Template_BR01'

    // Localizar o arquivo modelo original no servidor
    let templatePath = path.join(process.cwd(), fileName)
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), 'public', 'templates', isUnique ? 'modelo_produtos_unicos.xlsx' : 'modelo_produtos_variantes.xlsx')
    }

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Arquivo modelo oficial do UpSeller não encontrado no servidor.' }, { status: 500 })
    }

    const fileBuffer = fs.readFileSync(templatePath)
    const wb = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true })
    const ws = wb.Sheets[sheetName]

    if (!ws) {
      return NextResponse.json({ error: `Aba ${sheetName} não encontrada no modelo original.` }, { status: 500 })
    }

    // Limpar linhas de exemplo a partir da linha 2 (índice 2 em diante), preservando a linha 1 (cabeçalho) intacta com suas cores e estilos
    Object.keys(ws).forEach(cellKey => {
      if (cellKey.startsWith('!')) return
      const rowNum = parseInt(cellKey.replace(/^[A-Z]+/, ''), 10)
      if (rowNum >= 2) {
        delete ws[cellKey]
      }
    })

    // ─── Padronizar cabeçalho (linha 1) para garantir visual idêntico entre P2 e P3 ───
    // Mesmo fill, fonte, alinhamento e altura — independente do arquivo modelo de origem.
    const HEADER_STYLE = {
      fill: { patternType: 'solid', fgColor: { rgb: 'FF85D4E6' } },
      font: { name: '微软雅黑', sz: 10, bold: true, color: { rgb: 'FF000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    }
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C })
      if (ws[addr]) ws[addr].s = HEADER_STYLE
    }

    // Forçar altura da linha 1 para 58.5 (padrão da P3) em ambas as planilhas
    if (!ws['!rows']) ws['!rows'] = []
    ws['!rows'][0] = { hpt: 58.5, hpx: 58.5 }

    // Para a P2, ajustar larguras das colunas comuns para coincidir com as larguras da P3
    // (mapeamento: coluna funcional → largura usada na P3 para a mesma coluna)
    if (isUnique) {
      const p2ColWidths: Record<string, number> = {
        A: 32.7522123893805,  // SKU*
        B: 41,                 // Título*          (P3: C=41)
        C: 20.6637168141593,  // Apelido           (P3: D=20.66)
        D: 22.1150442477876,  // NFe               (P3: E=22.11)
        E: 18,                 // Preço de varejo   (P3: P=18)
        F: 18,                 // Custo de Compra   (P3: Q=18)
        G: 35.5044247787611,  // Quantidade        (P3: R=35.50)
        H: 35.5044247787611,  // N° do Estante     (P3: S=35.50)
        I: 26,                 // Código de Barras  (P3: T=26)
        J: 42.1150442477876,  // Apelido de SKU    (P3: U=42.11)
        K: 14,                 // Imagem            (P3: V=14)
        L: 13,                 // Peso (g)          (P3: W=13)
        M: 19,                 // Comprimento (cm)  (P3: X=19)
        N: 16.3805309734513,  // Largura (cm)      (P3: Y=16.38)
        O: 16,                 // Altura (cm)       (P3: Z=16)
        P: 13,                 // NCM               (P3: AA=13)
        Q: 13,                 // CEST              (P3: AB=13)
        R: 19,                 // Unidade           (P3: AC=19)
        S: 24,                 // Origem            (P3: AD=24)
        T: 26                  // Link do Fornecedor (P3: AE=26)
      }
      const cols = ws['!cols'] ?? []
      Object.entries(p2ColWidths).forEach(([letter, wpx]) => {
        const idx = letter.charCodeAt(0) - 65 // A=0, B=1...
        cols[idx] = { wch: wpx }
      })
      ws['!cols'] = cols
    }

    // Preencher com a grade de produtos do cliente
    if (isUnique) {
      products.forEach((p, idx) => {
        const row = idx + 2
        ws['A' + row] = { t: 's', v: p.sku || '' }
        ws['B' + row] = { t: 's', v: p.title || '' }
        ws['C' + row] = { t: 's', v: '' }
        ws['D' + row] = { t: 's', v: 'N' }
        ws['E' + row] = { t: 'n', v: 0 }
        ws['F' + row] = { t: 'n', v: p.costPrice || 0 }
        ws['G' + row] = { t: 's', v: '' }
        ws['H' + row] = { t: 's', v: '' }
        ws['I' + row] = { t: 's', v: '' }
        ws['J' + row] = { t: 's', v: '' }
        ws['K' + row] = { t: 's', v: p.imageUrl || '' }
        ws['L' + row] = { t: 'n', v: 1000 }
        ws['M' + row] = { t: 'n', v: 33 }
        ws['N' + row] = { t: 'n', v: 22 }
        ws['O' + row] = { t: 'n', v: 12 }
        ws['P' + row] = { t: 's', v: '' }
        ws['Q' + row] = { t: 's', v: '' }
        ws['R' + row] = { t: 's', v: 'UN' }
        ws['S' + row] = { t: 's', v: '0' }
        ws['T' + row] = { t: 's', v: '' }
      })
      ws['!ref'] = `A1:T${products.length + 1}`
    } else {
      products.forEach((p, idx) => {
        const row = idx + 2
        ws['A' + row] = { t: 's', v: p.spu || '' }
        ws['B' + row] = { t: 's', v: p.sku || '' }
        ws['C' + row] = { t: 's', v: p.title || '' }
        ws['D' + row] = { t: 's', v: '' }
        ws['E' + row] = { t: 's', v: 'N' }
        ws['F' + row] = { t: 's', v: 'COR' }
        ws['G' + row] = { t: 's', v: p.color || '' }
        ws['H' + row] = { t: 's', v: 'TAMANHO' }
        ws['I' + row] = { t: 's', v: p.size || '' }
        ws['J' + row] = { t: 's', v: '' }
        ws['K' + row] = { t: 's', v: '' }
        ws['L' + row] = { t: 's', v: '' }
        ws['M' + row] = { t: 's', v: '' }
        ws['N' + row] = { t: 's', v: '' }
        ws['O' + row] = { t: 's', v: '' }
        ws['P' + row] = { t: 'n', v: 0 }
        ws['Q' + row] = { t: 'n', v: p.costPrice || 0 }
        ws['R' + row] = { t: 's', v: '' }
        ws['S' + row] = { t: 's', v: '' }
        ws['T' + row] = { t: 's', v: '' }
        ws['U' + row] = { t: 's', v: '' }
        ws['V' + row] = { t: 's', v: p.imageUrl || '' }
        ws['W' + row] = { t: 'n', v: 1000 }
        ws['X' + row] = { t: 'n', v: 33 }
        ws['Y' + row] = { t: 'n', v: 22 }
        ws['Z' + row] = { t: 'n', v: 12 }
        ws['AA' + row] = { t: 's', v: '' }
        ws['AB' + row] = { t: 's', v: '' }
        ws['AC' + row] = { t: 's', v: 'UN' }
        ws['AD' + row] = { t: 's', v: '0' }
        ws['AE' + row] = { t: 's', v: '' }
      })
      ws['!ref'] = `A1:AE${products.length + 1}`
    }

    // Adicionar a aba "Erros" para auditoria se houver erros registrados
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
    if (errors && errors.length > 0) {
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
    }

    const wsErrors = XLSX.utils.aoa_to_sheet(errorRowsData)
    wb.Sheets['Erros'] = wsErrors
    if (!wb.SheetNames.includes('Erros')) {
      XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros')
    }

    const outputBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })

    const outFileName = isUnique
      ? 'Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx'
      : 'Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx'

    return new Response(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(outFileName)}"`
      }
    })
  } catch (err: any) {
    console.error('Erro na API de exportação de produtos:', err)
    return NextResponse.json({ error: err?.message || 'Erro interno ao gerar o arquivo Excel.' }, { status: 500 })
  }
}
