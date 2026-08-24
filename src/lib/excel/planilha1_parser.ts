import * as XLSX from 'xlsx'

export interface ErrorLogItem {
  type: 'CORRECAO' | 'ERRO' | 'CLASSIFICACAO' | 'AVISO'
  clientRow: number
  productName: string
  field: string
  originalValue: string
  correctedValue: string
  message: string
  generatedFile: 'Produtos Unicos' | 'Produtos Variantes' | 'Kits'
  upSellerLineRange: string
  imageUrl?: string
}

export interface ParsedProductVariant {
  spu: string
  sku: string
  title: string
  color: string
  size: string
  costPrice: number
  imageUrl: string
  supplier: string
  referenceModel: string
  ncm: string
  segmento: string
  clientRow: number
  isKitNative: boolean
}

export interface ParseResultPlanilha1 {
  uniqueProducts: ParsedProductVariant[]
  variantProducts: ParsedProductVariant[]
  errorLogs: ErrorLogItem[]
}

// 1. Utilitário de remoção de acentos e cedilha
export function removeAccentsAndCedilla(str: string): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
}

// 2. Higienização de strings gerais (remover acentos, espaços extras, Ç)
export function sanitizeText(str: string): string {
  if (!str) return ''
  let clean = removeAccentsAndCedilla(str)
  clean = clean.replace(/\s+/g, ' ').trim()
  return clean
}

// 3. Normalizador de Cores
export function normalizeColorName(colorRaw: string, rowIdx: number, prodName: string, errors: ErrorLogItem[]): string {
  if (!colorRaw) return ''

  let orig = colorRaw.trim()
  
  if (orig.includes(',')) {
    errors.push({
      type: 'ERRO',
      clientRow: rowIdx,
      productName: prodName,
      field: 'Cor',
      originalValue: orig,
      correctedValue: orig,
      message: 'Uso indevido de vírgula na coluna de cor. A cor foi mantida, mas verifique se não representa múltiplas variações.',
      generatedFile: 'Produtos Variantes',
      upSellerLineRange: '-'
    })
  }

  let clean = removeAccentsAndCedilla(orig)

  // Remover espaços em volta das barras (ex: "Preto / Branco" -> "Preto/Branco")
  clean = clean.replace(/\s*\/\s*/g, '/')
  // Garantir espaço único
  clean = clean.replace(/\s+/g, ' ').trim()

  // Masculinização e padronizações conhecidas
  const colorReplacements: [RegExp, string][] = [
    [/\bBranca\b/gi, 'Branco'],
    [/\bPreta\b/gi, 'Preto'],
    [/\bVermelha\b/gi, 'Vermelho'],
    [/\bAmarela\b/gi, 'Amarelo'],
    [/\bRoxa\b/gi, 'Roxo'],
    [/\bCinza Chumbo\b/gi, 'Cinza Chumbo'],
    [/\bOff White\b/gi, 'Off White'],
    [/\bOff white\b/gi, 'Off White'],
    [/\bOff\b/gi, 'Off White'],
    [/\bCafe Morrom\b/gi, 'Cafe Marrom'],
    [/\bMarrom Cafe\b/gi, 'Marrom Cafe'],
    [/\bAzul Bebe\b/gi, 'Azul Bebe'],
    [/\bVinho Bordo\b/gi, 'Vinho Bordo'],
    [/\bRose\b/gi, 'Rose'],
  ]

  colorReplacements.forEach(([pattern, rep]) => {
    clean = clean.replace(pattern, rep)
  })

  // Garantir conectivo "e" minúsculo
  clean = clean.replace(/\b E \b/g, ' e ')

  if (clean !== orig) {
    errors.push({
      type: 'CORRECAO',
      clientRow: rowIdx,
      productName: prodName,
      field: 'Cor',
      originalValue: orig,
      correctedValue: clean,
      message: 'Nome da cor padronizado (masculinizado / ortografia ajustada).',
      generatedFile: 'Produtos Variantes',
      upSellerLineRange: '-'
    })
  }

  return clean
}

// 4. Expansão de Tamanhos por Segmento e Validação de Tamanho Único
export function expandSizes(
  sizeRaw: string,
  segmentoRaw: string,
  rowIdx: number,
  prodName: string,
  errors: ErrorLogItem[]
): string[] {
  if (!sizeRaw) return ['']
  const cleanStr = sizeRaw.trim()

  // Tamanho Único ("U", "Único", "Unico") -> não gerar variações de tamanho
  if (/^(unico|único|u)$/i.test(cleanStr)) {
    return ['']
  }

  const cleanSeg = sanitizeText(segmentoRaw || '').toUpperCase()
  let isCalcado = cleanSeg.includes('CALC')

  // Auto-detectar segmento de Calçados se não informado
  if (!cleanSeg) {
    if (/^\d+\/\d+\s+ao\s+\d+\/\d+$/i.test(cleanStr)) {
      isCalcado = true
    }
  }

  // 1. Pares combinados de calçados (ex: "20/21 ao 48/49" ou "19/20 ao 47/48")
  const pairRangeMatch = cleanStr.match(/^(\d+)\/(\d+)\s+ao\s+(\d+)\/(\d+)$/i)
  if (pairRangeMatch) {
    const start1 = parseInt(pairRangeMatch[1], 10)
    const end1 = parseInt(pairRangeMatch[3], 10)
    const sizes: string[] = []

    for (let current = start1; current <= end1; current += 2) {
      sizes.push(`${current}/${current + 1}`)
    }
    return sizes
  }

  // 2. Conectivo "ao" para grades alfanuméricas de vestuário
  const letterGrades = [
    ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'],
    ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL'],
    ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']
  ]

  const rangeMatch = cleanStr.match(/^([A-Z0-9]+)\s+ao\s+([A-Z0-9]+)$/i)
  if (rangeMatch) {
    const startStr = rangeMatch[1].toUpperCase()
    const endStr = rangeMatch[2].toUpperCase()

    for (const grade of letterGrades) {
      const startIndex = grade.indexOf(startStr)
      const endIndex = grade.indexOf(endStr)
      if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
        return grade.slice(startIndex, endIndex + 1)
      }
    }
  }

  // 3. Conectivo "ao" para faixas numéricas ("34 ao 50", "20 ao 48", "1 ao 16", "36 ao 42", etc.)
  const numRangeMatch = cleanStr.match(/^(\d+)\s+ao\s+(\d+)$/i)
  if (numRangeMatch) {
    const start = parseInt(numRangeMatch[1], 10)
    const end = parseInt(numRangeMatch[2], 10)

    if (start <= end) {
      // Calçados -> Inteiros sequenciais de 1 em 1
      if (isCalcado) {
        const sizes: string[] = []
        for (let i = start; i <= end; i++) {
          sizes.push(i.toString())
        }
        return sizes
      }

      // Vestuário Infantil -> Régua oficial 1 a 16
      const infantSequence = ['1', '2', '3', '4', '6', '8', '10', '12', '14', '16']
      if (start >= 1 && end <= 16 && (start <= 4 || infantSequence.includes(start.toString()))) {
        const sIdx = infantSequence.indexOf(start.toString())
        const eIdx = infantSequence.indexOf(end.toString())
        if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
          return infantSequence.slice(sIdx, eIdx + 1)
        }
      }

      // Vestuário Adulto -> Pares de 2 em 2 (quando pares)
      const sizes: string[] = []
      const step = (start % 2 === 0 && end % 2 === 0) ? 2 : 1
      for (let i = start; i <= end; i += step) {
        sizes.push(i.toString())
      }
      return sizes
    }
  }

  // Conectivo "e" ou Vírgulas ("PP, M, GG" ou "P e GG")
  if (cleanStr.includes(',') || /\s+e\s+/i.test(cleanStr)) {
    const parts = cleanStr.split(/,|\s+e\s+/i).map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts
  }

  // Caso seja tamanho único simples
  return [cleanStr]
}

// 5. Detectar se o título é de um Kit Nativo
export function extractNativeKitInfo(title: string): { isKit: boolean; kitQty?: number; cleanTitle: string } {
  let clean = title.trim()
  const kitMatch = clean.match(/\bkit\s*(\d+)?\b/i)

  if (kitMatch) {
    let qty = 1
    if (kitMatch[1]) {
      qty = parseInt(kitMatch[1], 10)
    } else {
      // Procurar número próximo
      const numMatch = clean.match(/kit\D+(\d+)/i)
      if (numMatch) qty = parseInt(numMatch[1], 10)
    }

    return { isKit: true, kitQty: qty > 0 ? qty : 2, cleanTitle: clean }
  }

  return { isKit: false, cleanTitle: clean }
}

// 6. Parser principal do buffer / arquivo `.xlsx` da Planilha 1
export function parsePlanilha1(fileBuffer: ArrayBuffer): ParseResultPlanilha1 {
  const workbook = XLSX.read(fileBuffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

  const errorLogs: ErrorLogItem[] = []
  if (rawRows.length < 2) {
    return { uniqueProducts: [], variantProducts: [], errorLogs }
  }

  const headers = rawRows[0].map(h => String(h || '').trim())
  
  // Identificar colunas fixas
  const getColIndex = (name: string) => headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')))

  const colSeg = getColIndex('seguimento') !== -1 ? getColIndex('seguimento') : getColIndex('segmento')
  const colProd = getColIndex('produto') !== -1 ? getColIndex('produto') : (colSeg !== -1 ? 1 : 0)
  const colForn = getColIndex('fornecedor') !== -1 ? getColIndex('fornecedor') : (colSeg !== -1 ? 2 : 1)
  const colMod = getColIndex('modelo') !== -1 ? getColIndex('modelo') : (colSeg !== -1 ? 3 : 2)
  const colTam = getColIndex('tamanho') !== -1 ? getColIndex('tamanho') : (colSeg !== -1 ? 4 : 3)
  const colPreco = getColIndex('preco') !== -1 ? getColIndex('preco') : (getColIndex('custo') !== -1 ? getColIndex('custo') : (colSeg !== -1 ? 5 : 4))
  const colNcm = getColIndex('ncm') !== -1 ? getColIndex('ncm') : (colSeg !== -1 ? 6 : -1)

  // Mapear colunas de Cor e Imagem
  const startColorCol = Math.max(5, colNcm !== -1 ? colNcm + 1 : 5)
  const colorImageCols: { colorCol: number; imgCol: number }[] = []
  for (let c = startColorCol; c < headers.length; c++) {
    const hName = headers[c].toLowerCase()
    if (hName.includes('cor') && !hName.includes('link') && !hName.includes('imagem')) {
      // Verificar se a próxima coluna é a imagem
      const nextHName = (headers[c + 1] || '').toLowerCase()
      if (nextHName.includes('link') || nextHName.includes('imagem') || nextHName.includes('foto')) {
        colorImageCols.push({ colorCol: c, imgCol: c + 1 })
      }
    }
  }

  // Se não achou colunas dinâmicas pelo nome, tenta par de colunas consecutivas
  if (colorImageCols.length === 0) {
    for (let c = startColorCol; c < headers.length; c += 2) {
      colorImageCols.push({ colorCol: c, imgCol: c + 1 })
    }
  }

  const allVariants: ParsedProductVariant[] = []

  // Ler linhas da planilha do cliente
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r]
    if (!row || row.length === 0) continue

    const segmentoRaw = colSeg !== -1 ? String(row[colSeg] || '').trim() : ''
    const prodTitleRaw = String(row[colProd] || '').trim()
    const supplierRaw = String(row[colForn] || '').trim()
    const modelRaw = String(row[colMod] || '').trim()
    const sizeRaw = String(row[colTam] || '').trim()
    const priceRaw = parseFloat(String(row[colPreco] || '0').replace(',', '.')) || 0
    const ncmRaw = colNcm !== -1 ? String(row[colNcm] || '').trim() : ''

    if (!prodTitleRaw && !modelRaw) continue

    // Extrair Kit Nativo
    const kitInfo = extractNativeKitInfo(prodTitleRaw)
    const cleanSupplier = sanitizeText(supplierRaw).toUpperCase()
    const cleanModel = sanitizeText(modelRaw)

    let spu = ''
    const spuParts = [cleanSupplier, cleanModel].filter(Boolean)
    if (kitInfo.isKit && kitInfo.kitQty) {
      spu = `KIT${kitInfo.kitQty}-${spuParts.join('-')}`
      errorLogs.push({
        type: 'AVISO',
        clientRow: r + 1,
        productName: prodTitleRaw,
        field: 'SPU',
        originalValue: spuParts.join('-'),
        correctedValue: spu,
        message: `Inclusão da tag KIT${kitInfo.kitQty} no início do SPU por tratar-se de kit nativo.`,
        generatedFile: 'Produtos Variantes',
        upSellerLineRange: '-'
      })
    } else {
      spu = spuParts.join('-')
    }

    spu = sanitizeText(spu)

    // Expandir tamanhos considerando o segmento
    const expandedSizes = expandSizes(sizeRaw, segmentoRaw, r + 1, prodTitleRaw, errorLogs)

    // Coletar variações de cores presentes na linha
    const foundColorEntries: { colorRaw: string; imgLinkRaw: string }[] = []
    colorImageCols.forEach(({ colorCol, imgCol }) => {
      const cVal = String(row[colorCol] || '').trim()
      const iVal = String(row[imgCol] || '').trim()
      if (cVal || iVal) {
        foundColorEntries.push({ colorRaw: cVal, imgLinkRaw: iVal })
      }
    })

    // Se nenhuma cor foi preenchida nas colunas de cor, considerar 1 entrada com cor vazia
    if (foundColorEntries.length === 0) {
      // Buscar se há algum link de imagem em qualquer coluna de imagem
      let fallbackImg = ''
      colorImageCols.forEach(({ imgCol }) => {
        if (!fallbackImg && row[imgCol]) fallbackImg = String(row[imgCol]).trim()
      })
      foundColorEntries.push({ colorRaw: '', imgLinkRaw: fallbackImg })
    }

    // Se SPU ficar totalmente vazio (sem fornecedor e sem modelo), registrar erro
    if (!spu) {
      errorLogs.push({
        type: 'ERRO',
        clientRow: r + 1,
        productName: prodTitleRaw,
        field: 'SPU / SKU',
        originalValue: '',
        correctedValue: '',
        message: 'Produto sem Fornecedor e sem Modelo informados. Não foi possível determinar o identificador de SPU/SKU.',
        generatedFile: 'Produtos Unicos',
        upSellerLineRange: '-'
      })
    }

    // Iterar pelas entradas de Cor e Imagem
    foundColorEntries.forEach(({ colorRaw, imgLinkRaw }) => {
      const cleanColor = colorRaw ? normalizeColorName(colorRaw, r + 1, prodTitleRaw, errorLogs) : ''

      // Validação do link de imagem
      let validImgLink = imgLinkRaw
      if (imgLinkRaw) {
        let hasImgErr = false
        if (!imgLinkRaw.startsWith('http://') && !imgLinkRaw.startsWith('https://')) {
          hasImgErr = true
          errorLogs.push({
            type: 'ERRO',
            clientRow: r + 1,
            productName: prodTitleRaw,
            field: 'Link Imagem',
            originalValue: imgLinkRaw,
            correctedValue: '',
            message: 'O link da imagem deve iniciar com http:// ou https://.',
            generatedFile: 'Produtos Variantes',
            upSellerLineRange: '-'
          })
        }
        if (!/\.(jpg|jpeg|png)($|\?)/i.test(imgLinkRaw)) {
          hasImgErr = true
          errorLogs.push({
            type: 'ERRO',
            clientRow: r + 1,
            productName: prodTitleRaw,
            field: 'Link Imagem',
            originalValue: imgLinkRaw,
            correctedValue: '',
            message: 'Apenas links de imagem nos formatos JPG/JPEG/PNG são suportados pelo UpSeller.',
            generatedFile: 'Produtos Variantes',
            upSellerLineRange: '-'
          })
        }
        if (hasImgErr) {
          validImgLink = '' // Deixa a célula em branco na planilha gerada em caso de erro
        }
      } else {
        errorLogs.push({
          type: 'ERRO',
          clientRow: r + 1,
          productName: prodTitleRaw,
          field: 'Link Imagem',
          originalValue: '',
          correctedValue: '',
          message: cleanColor ? `Cor '${cleanColor}' sem link de imagem associado.` : 'Produto sem link de imagem associado.',
          generatedFile: 'Produtos Unicos',
          upSellerLineRange: '-'
        })
      }

      // Gerar uma variante para cada tamanho expandido
      expandedSizes.forEach(sizeVal => {
        const cleanSize = sanitizeText(sizeVal)
        // SKU = SPU-Cor-Tamanho (sem hífens sobrando se algum campo estiver vazio)
        const skuParts = [spu, cleanColor, cleanSize].filter(Boolean)
        let sku = skuParts.join('-').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')

        if (!sku) {
          sku = `PROD-LINHA-${r + 1}`
        }

        allVariants.push({
          spu: spu || `PROD-LINHA-${r + 1}`,
          sku,
          title: prodTitleRaw || cleanModel || cleanSupplier || `Produto Linha ${r + 1}`,
          color: cleanColor,
          size: cleanSize,
          costPrice: priceRaw,
          imageUrl: validImgLink,
          supplier: cleanSupplier,
          referenceModel: cleanModel,
          ncm: ncmRaw,
          segmento: segmentoRaw,
          clientRow: r + 1,
          isKitNative: kitInfo.isKit
        })
      })
    })
  }

  // Agrupar por SPU para classificar em Produto Único vs. Produto Variante
  const spuGroups = new Map<string, ParsedProductVariant[]>()
  allVariants.forEach(v => {
    const list = spuGroups.get(v.spu) || []
    list.push(v)
    spuGroups.set(v.spu, list)
  })

  const uniqueProducts: ParsedProductVariant[] = []
  const variantProducts: ParsedProductVariant[] = []

  spuGroups.forEach((variants, spuKey) => {
    // Coletar cores e tamanhos distintos para este SPU
    const distinctColors = new Set(variants.map(v => v.color))
    const distinctSizes = new Set(variants.map(v => v.size))

    // Regra 7: Apenas é Produto Único se tiver exatamente 1 Cor E 1 Tamanho
    if (distinctColors.size === 1 && distinctSizes.size === 1) {
      variants.forEach(v => uniqueProducts.push(v))
    } else {
      variants.forEach(v => variantProducts.push(v))
    }
  })

  // Mapear cada variante para sua linha exata na planilha gerada e atualizar upSellerLineRange e generatedFile nos errorLogs
  const clientRowToGeneratedLine = new Map<number, { uniqueLines: number[]; variantLines: number[] }>()

  uniqueProducts.forEach((p, idx) => {
    const lineNum = idx + 2
    const entry = clientRowToGeneratedLine.get(p.clientRow) || { uniqueLines: [], variantLines: [] }
    entry.uniqueLines.push(lineNum)
    clientRowToGeneratedLine.set(p.clientRow, entry)
  })

  variantProducts.forEach((p, idx) => {
    const lineNum = idx + 2
    const entry = clientRowToGeneratedLine.get(p.clientRow) || { uniqueLines: [], variantLines: [] }
    entry.variantLines.push(lineNum)
    clientRowToGeneratedLine.set(p.clientRow, entry)
  })

  const uniqueClientRows = new Set(uniqueProducts.map(p => p.clientRow))
  const variantClientRows = new Set(variantProducts.map(p => p.clientRow))

  errorLogs.forEach(err => {
    // 1. Atualizar generatedFile de acordo com a classificação real do produto final
    if (uniqueClientRows.has(err.clientRow) && !variantClientRows.has(err.clientRow)) {
      err.generatedFile = 'Produtos Unicos'
    } else if (variantClientRows.has(err.clientRow)) {
      err.generatedFile = 'Produtos Variantes'
    }

    // 2. Atualizar intervalo de linhas da planilha gerada (upSellerLineRange)
    const genInfo = clientRowToGeneratedLine.get(err.clientRow)
    if (genInfo) {
      const isUniqueFile = err.generatedFile === 'Produtos Unicos'
      const lines = isUniqueFile ? genInfo.uniqueLines : genInfo.variantLines
      const targetLines = lines.length > 0 ? lines : [...genInfo.uniqueLines, ...genInfo.variantLines]
      
      if (targetLines.length === 1) {
        err.upSellerLineRange = `Linha ${targetLines[0]}`
      } else if (targetLines.length > 1) {
        const min = Math.min(...targetLines)
        const max = Math.max(...targetLines)
        err.upSellerLineRange = min === max ? `Linha ${min}` : `Linhas ${min}-${max}`
      }
    }
  })

  return { uniqueProducts, variantProducts, errorLogs }
}
