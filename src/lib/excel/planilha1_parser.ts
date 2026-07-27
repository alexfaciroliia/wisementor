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

// 4. Expansão de Tamanhos
export function expandSizes(sizeRaw: string, rowIdx: number, prodName: string, errors: ErrorLogItem[]): string[] {
  if (!sizeRaw) return ['']
  const cleanStr = sizeRaw.trim()

  // Regra 6.6: Tamanho Único (não adicionar 'U' como tamanho)
  if (/^(unico|único|u)$/i.test(cleanStr)) {
    return ['']
  }

  // Regra 6.3: Conectivo "a" (NÃO expandir) e.g. "34 a 40"
  if (/\b\d+\s+a\s+\d+\b/i.test(cleanStr)) {
    return [cleanStr]
  }

  // Regra 6.2: Faixas numéricas em pares unidas por barra "27/28 ao 43/44"
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

  // Regra 6.1: Conectivo "ao" para Letras ("PP ao GG")
  const letterRangeMatch = cleanStr.match(/^(PP|P|M|G|GG)\s+ao\s+(PP|P|M|G|GG)$/i)
  if (letterRangeMatch) {
    const letterOrder = ['PP', 'P', 'M', 'G', 'GG']
    const startIndex = letterOrder.indexOf(letterRangeMatch[1].toUpperCase())
    const endIndex = letterOrder.indexOf(letterRangeMatch[2].toUpperCase())

    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
      return letterOrder.slice(startIndex, endIndex + 1)
    }
  }

  // Regra 6.1: Conectivo "ao" para Números Simples ("34 ao 40")
  const numRangeMatch = cleanStr.match(/^(\d+)\s+ao\s+(\d+)$/i)
  if (numRangeMatch) {
    const start = parseInt(numRangeMatch[1], 10)
    const end = parseInt(numRangeMatch[2], 10)
    const sizes: string[] = []
    if (start <= end) {
      for (let i = start; i <= end; i++) {
        sizes.push(i.toString())
      }
      return sizes
    }
  }

  // Regra 6.4 e 6.5: Conectivo "e" ou Vírgulas ("PP, M, GG" ou "P e GG")
  if (cleanStr.includes(',') || /\s+e\s+/i.test(cleanStr)) {
    const parts = cleanStr.split(/,|\s+e\s+/i).map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts
  }

  // Caso seja um tamanho simples único
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

  const colProd = getColIndex('produto') !== -1 ? getColIndex('produto') : 0
  const colForn = getColIndex('fornecedor') !== -1 ? getColIndex('fornecedor') : 1
  const colMod = getColIndex('modelo') !== -1 ? getColIndex('modelo') : 2
  const colTam = getColIndex('tamanho') !== -1 ? getColIndex('tamanho') : 3
  const colPreco = getColIndex('preco') !== -1 ? getColIndex('preco') : (getColIndex('custo') !== -1 ? getColIndex('custo') : 4)

  // Mapear colunas de Cor e Imagem
  const colorImageCols: { colorCol: number; imgCol: number }[] = []
  for (let c = 5; c < headers.length; c++) {
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
    for (let c = 5; c < headers.length; c += 2) {
      colorImageCols.push({ colorCol: c, imgCol: c + 1 })
    }
  }

  const allVariants: ParsedProductVariant[] = []

  // Ler linhas da planilha do cliente
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r]
    if (!row || row.length === 0) continue

    const prodTitleRaw = String(row[colProd] || '').trim()
    const supplierRaw = String(row[colForn] || '').trim()
    const modelRaw = String(row[colMod] || '').trim()
    const sizeRaw = String(row[colTam] || '').trim()
    const priceRaw = parseFloat(String(row[colPreco] || '0').replace(',', '.')) || 0

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

    // Expandir tamanhos
    const expandedSizes = expandSizes(sizeRaw, r + 1, prodTitleRaw, errorLogs)

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
      if (imgLinkRaw) {
        if (!imgLinkRaw.startsWith('http://') && !imgLinkRaw.startsWith('https://')) {
          errorLogs.push({
            type: 'ERRO',
            clientRow: r + 1,
            productName: prodTitleRaw,
            field: 'Link Imagem',
            originalValue: imgLinkRaw,
            correctedValue: imgLinkRaw,
            message: 'O link da imagem deve iniciar com http:// ou https://.',
            generatedFile: 'Produtos Variantes',
            upSellerLineRange: '-'
          })
        }
        if (!/\.(jpg|jpeg|png)($|\?)/i.test(imgLinkRaw)) {
          errorLogs.push({
            type: 'ERRO',
            clientRow: r + 1,
            productName: prodTitleRaw,
            field: 'Link Imagem',
            originalValue: imgLinkRaw,
            correctedValue: imgLinkRaw,
            message: 'Apenas links de imagem nos formatos JPG/JPEG/PNG são suportados pelo UpSeller.',
            generatedFile: 'Produtos Variantes',
            upSellerLineRange: '-'
          })
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
          imageUrl: imgLinkRaw,
          supplier: cleanSupplier,
          referenceModel: cleanModel,
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

  return { uniqueProducts, variantProducts, errorLogs }
}
