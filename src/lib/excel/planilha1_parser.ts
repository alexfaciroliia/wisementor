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
  if (!sizeRaw) return ['U']
  const cleanStr = sizeRaw.trim()

  // Regra 6.6: Tamanho Único
  if (/^(unico|único|u)$/i.test(cleanStr)) {
    return ['U']
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
    if (kitInfo.isKit && kitInfo.kitQty) {
      spu = `KIT${kitInfo.kitQty}-${cleanSupplier}-${cleanModel}`
      errorLogs.push({
        type: 'AVISO',
        clientRow: r + 1,
        productName: prodTitleRaw,
        field: 'SPU',
        originalValue: `${cleanSupplier}-${cleanModel}`,
        correctedValue: spu,
        message: `Inclusão da tag KIT${kitInfo.kitQty} no início do SPU por tratar-se de kit nativo.`,
        generatedFile: 'Produtos Variantes',
        upSellerLineRange: '-'
      })
    } else {
      spu = `${cleanSupplier}-${cleanModel}`
    }

    spu = sanitizeText(spu)

    // Expandir tamanhos
    const expandedSizes = expandSizes(sizeRaw, r + 1, prodTitleRaw, errorLogs)

    // Iterar pelos pares de Cor e Imagem
    colorImageCols.forEach(({ colorCol, imgCol }) => {
      const colorRaw = String(row[colorCol] || '').trim()
      const imgLinkRaw = String(row[imgCol] || '').trim()

      if (!colorRaw) return

      const cleanColor = normalizeColorName(colorRaw, r + 1, prodTitleRaw, errorLogs)

      // Validação do link de imagem
      if (imgLinkRaw && !imgLinkRaw.startsWith('http://') && !imgLinkRaw.startsWith('https://')) {
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

      if (!imgLinkRaw) {
        errorLogs.push({
          type: 'ERRO',
          clientRow: r + 1,
          productName: prodTitleRaw,
          field: 'Link Imagem',
          originalValue: '',
          correctedValue: '',
          message: `Cor '${cleanColor}' sem link de imagem associado.`,
          generatedFile: 'Produtos Variantes',
          upSellerLineRange: '-'
        })
      }

      // Gerar uma variante para cada tamanho expandido
      expandedSizes.forEach(sizeVal => {
        const cleanSize = sanitizeText(sizeVal)
        // SKU = SPU-Cor-Tamanho
        const sku = `${spu}-${cleanColor}-${cleanSize}`.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')

        allVariants.push({
          spu,
          sku,
          title: prodTitleRaw,
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
      errorLogs.push({
        type: 'CLASSIFICACAO',
        clientRow: variants[0].clientRow,
        productName: variants[0].title,
        field: 'Classificacao',
        originalValue: spuKey,
        correctedValue: 'Produto Unico',
        message: `Produto ${spuKey} classificado como Produto Único (possui 1 cor e 1 tamanho simultaneamente).`,
        generatedFile: 'Produtos Unicos',
        upSellerLineRange: '-'
      })
    } else {
      variants.forEach(v => variantProducts.push(v))
    }
  })

  return { uniqueProducts, variantProducts, errorLogs }
}
