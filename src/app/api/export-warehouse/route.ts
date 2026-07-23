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
