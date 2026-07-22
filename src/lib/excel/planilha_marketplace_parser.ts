import { removeAccentsAndCedilla, sanitizeText, ErrorLogItem } from './planilha1_parser'

export interface WarehouseProductItem {
  spu: string
  sku: string
  color: string
  size: string
  product_name?: string
}

export interface MarketplaceListingRow {
  rowIdx: number
  listingId: string
  title: string
  status: string
  colorRaw?: string
  sizeRaw?: string
  imageUrl?: string
  marketplaceSkuRaw?: string
  rawRowData?: any
}

export interface GeneratedKitRow {
  kitSku: string
  title: string
  imageUrl: string
  sku: string
  skuQty: number
}

export interface ProcessedListingResult {
  listingId: string
  title: string
  cleanTitle: string
  statusMarketplace: string
  listingStatus: 'pending' | 'standardized' | 'ignored_conjunto' | 'ambiguous_error' | 'blocked_error'
  detectedType: 'simple' | 'kit' | 'conjunto' | 'unknown'
  kitSku?: string
  generatedKitRows: GeneratedKitRow[]
  errorLogs: ErrorLogItem[]
}

export interface ParseMarketplaceResult {
  kitsRows: GeneratedKitRow[]
  allListings: ProcessedListingResult[]
  errorLogs: ErrorLogItem[]
}

// 1. Extração de quantidade do kit a partir do título do anúncio
export function parseKitQuantity(title: string): number | null {
  const clean = title.trim()
  
  // Tenta padrões como "Kit 2", "Kit 3", "Kit 10", "Kit c/ 2", "Kit com 3", "2 Pares", "3 Unidades"
  const kitMatch = clean.match(/kit\s*(?:c\/|com\s*)?(\d+)\b/i)
  if (kitMatch && kitMatch[1]) {
    return parseInt(kitMatch[1], 10)
  }

  const numPrefixMatch = clean.match(/(\d+)\s*(?:unidades|pares|pecas|peças|itens)\b/i)
  if (numPrefixMatch && numPrefixMatch[1]) {
    return parseInt(numPrefixMatch[1], 10)
  }

  return null
}

// 2. Normalização de String para Busca Fuzzy Tolerante
export function normalizeForMatch(str: string): string {
  if (!str) return ''
  let clean = removeAccentsAndCedilla(str).toLowerCase()
  clean = clean.replace(/ç/g, 'c')
  clean = clean.replace(/\s*\/\s*/g, '/')
  clean = clean.replace(/branca/g, 'branco').replace(/preta/g, 'preto').replace(/vermelha/g, 'vermelho')
  clean = clean.replace(/off white/g, 'off white').replace(/off/g, 'off white')
  clean = clean.replace(/bebe/g, 'bebe').replace(/bordo/g, 'bordo').replace(/rose/g, 'rose')
  return clean.replace(/\s+/g, ' ').trim()
}

// 3. Processar Anúncios do Marketplace conforme Prompt 2
export function processMarketplaceListings(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string,
  kitKeywords: string[] = ['kit', '+', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto']
): ParseMarketplaceResult {
  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []

  const cleanTargetSpu = sanitizeText(targetSpu).toUpperCase()

  // Filtrar produtos da base oficial do UpSeller para o SPU informado
  const officialProducts = warehouseProducts.filter(p => sanitizeText(p.spu).toUpperCase() === cleanTargetSpu)

  marketplaceRows.forEach(item => {
    const localErrors: ErrorLogItem[] = []
    const rawTitle = item.title || ''
    const titleLower = rawTitle.toLowerCase()
    const cleanTitle = sanitizeText(rawTitle)

    // Regra 2: Somente processar anúncios ativos
    const isAtivo = /^(ativo|active|1|sim|enabled)$/i.test((item.status || '').trim())
    if (!isAtivo) {
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status || 'inativo',
        listingStatus: 'blocked_error',
        detectedType: 'unknown',
        generatedKitRows: [],
        errorLogs: [{
          type: 'ERRO',
          clientRow: item.rowIdx,
          productName: rawTitle,
          field: 'Status Anúncio',
          originalValue: item.status || '',
          correctedValue: '-',
          message: 'Anúncio não está ativo. Ignorado conforme regra de segurança.',
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        }]
      })
      return
    }

    // Regra: Verificar se é "Conjunto" (Conjuntos não são padronizados e ficam como Pendentes)
    const isConjunto = ignoreKeywords.some(kw => titleLower.includes(kw.toLowerCase()))
    if (isConjunto) {
      const warningItem: ErrorLogItem = {
        type: 'AVISO',
        clientRow: item.rowIdx,
        productName: rawTitle,
        field: 'Tipo Anúncio',
        originalValue: rawTitle,
        correctedValue: 'PENDENTE (Conjunto)',
        message: 'Anúncio do tipo "Conjunto" identificado. Mantido no sistema como Pendente sem alterar SKU.',
        generatedFile: 'Kits',
        upSellerLineRange: '-'
      }
      globalErrorLogs.push(warningItem)
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status,
        listingStatus: 'ignored_conjunto',
        detectedType: 'conjunto',
        generatedKitRows: [],
        errorLogs: [warningItem]
      })
      return
    }

    // Verificar se é Kit
    const isKitByKeyword = kitKeywords.some(kw => titleLower.includes(kw.toLowerCase()))
    const kitQty = parseKitQuantity(rawTitle)

    if (!isKitByKeyword && !kitQty) {
      // Tratar como Anúncio Simples
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status,
        listingStatus: 'standardized',
        detectedType: 'simple',
        generatedKitRows: [],
        errorLogs: []
      })
      return
    }

    // Se for kit, validação obrigatória da quantidade
    const qtyTotal = kitQty || 2

    // Validação da imagem
    const imgUrl = (item.imageUrl || '').trim()
    if (!imgUrl || (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://'))) {
      localErrors.push({
        type: 'ERRO',
        clientRow: item.rowIdx,
        productName: rawTitle,
        field: 'Imagem',
        originalValue: imgUrl,
        correctedValue: '',
        message: 'Link de imagem do kit ausente ou inválido (deve iniciar com http:// ou https://).',
        generatedFile: 'Kits',
        upSellerLineRange: '-'
      })
    }

    // Validação da base oficial do UpSeller para o SPU
    if (officialProducts.length === 0) {
      localErrors.push({
        type: 'ERRO',
        clientRow: item.rowIdx,
        productName: rawTitle,
        field: 'SPU',
        originalValue: targetSpu,
        correctedValue: '',
        message: `SPU '${targetSpu}' não encontrado na base oficial de produtos do UpSeller.`,
        generatedFile: 'Kits',
        upSellerLineRange: '-'
      })
    }

    // Decomposição de variações de cores e tamanho
    const rawColorStr = item.colorRaw || ''
    const rawSizeStr = item.sizeRaw || 'U'

    // Separar cores por underline, vírgula, mais ou barra quando representarem múltiplas unidades
    let colorList = rawColorStr.split(/_|,|\+/).map(c => c.trim()).filter(Boolean)
    if (colorList.length === 0) {
      colorList = [rawColorStr || 'Unica']
    }

    // Se a quantidade do kit for 3 e tiver apenas 1 cor no título (ex: "Preto"), repete a cor
    if (colorList.length === 1 && qtyTotal > 1) {
      const singleColor = colorList[0]
      colorList = Array(qtyTotal).fill(singleColor)
    }

    // Localizar SKUs oficiais correspondentes
    const matchedOfficialSkus: { officialItem: WarehouseProductItem; qty: number }[] = []
    const skuQtyMap = new Map<string, { item: WarehouseProductItem; qty: number }>()

    let hasMatchingError = false

    for (const cName of colorList) {
      const normColor = normalizeForMatch(cName)
      const normSize = normalizeForMatch(rawSizeStr)

      // Busca por correspondência exata ou fuzzy
      const candidates = officialProducts.filter(p => {
        const pColorNorm = normalizeForMatch(p.color)
        const pSizeNorm = normalizeForMatch(p.size)
        return (pColorNorm === normColor || pColorNorm.includes(normColor)) &&
               (pSizeNorm === normSize || normSize === 'u' || pSizeNorm === 'u')
      })

      if (candidates.length === 0) {
        hasMatchingError = true
        localErrors.push({
          type: 'ERRO',
          clientRow: item.rowIdx,
          productName: rawTitle,
          field: 'Cor/Tamanho',
          originalValue: `${cName} - ${rawSizeStr}`,
          correctedValue: '-',
          message: `Nenhum SKU oficial do armazém encontrado para a variação '${cName} - ${rawSizeStr}' no SPU '${cleanTargetSpu}'.`,
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        })
      } else if (candidates.length > 1) {
        hasMatchingError = true
        localErrors.push({
          type: 'ERRO',
          clientRow: item.rowIdx,
          productName: rawTitle,
          field: 'Correspondência',
          originalValue: `${cName} - ${rawSizeStr}`,
          correctedValue: candidates.map(c => c.sku).join(' | '),
          message: `Correspondência ambígua! Mais de um SKU oficial candidato encontrado.`,
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        })
      } else {
        const found = candidates[0]
        const existing = skuQtyMap.get(found.sku)
        if (existing) {
          existing.qty += 1
        } else {
          skuQtyMap.set(found.sku, { item: found, qty: 1 })
        }
      }
    }

    // Se houve erro bloqueante, registra e aborta geração das linhas do kit
    if (hasMatchingError || localErrors.some(e => e.type === 'ERRO')) {
      localErrors.forEach(err => globalErrorLogs.push(err))
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status,
        listingStatus: 'blocked_error',
        detectedType: 'kit',
        generatedKitRows: [],
        errorLogs: localErrors
      })
      return
    }

    // Formação do Kit SKU: KIT(QTD)-SPU-CORES_SEPARADAS_POR_UNDERLINE-TAMANHO
    const consolidatedList = Array.from(skuQtyMap.values())
    const colorsFormatted: string[] = []

    consolidatedList.forEach(({ item: pItem, qty }) => {
      const colorClean = removeAccentsAndCedilla(pItem.color).replace(/ç/gi, 'c')
      for (let i = 0; i < qty; i++) {
        colorsFormatted.push(colorClean)
      }
    })

    const sampleSize = consolidatedList[0]?.item.size || rawSizeStr
    const cleanSizeFormatted = removeAccentsAndCedilla(sampleSize)

    const kitSku = `KIT${qtyTotal}-${cleanTargetSpu}-${colorsFormatted.join('_')}-${cleanSizeFormatted}`.replace(/\s+/g, ' ')

    const itemKitRows: GeneratedKitRow[] = []

    // Gerar linhas da aba "Formação dos Kits"
    consolidatedList.forEach(({ item: pItem, qty }) => {
      const kitRow: GeneratedKitRow = {
        kitSku,
        title: cleanTitle,
        imageUrl: imgUrl,
        sku: pItem.sku,
        skuQty: qty
      }
      kitsRows.push(kitRow)
      itemKitRows.push(kitRow)
    })

    allListings.push({
      listingId: item.listingId,
      title: rawTitle,
      cleanTitle,
      statusMarketplace: item.status,
      listingStatus: 'standardized',
      detectedType: 'kit',
      kitSku,
      generatedKitRows: itemKitRows,
      errorLogs: localErrors
    })
  })

  return { kitsRows, allListings, errorLogs: globalErrorLogs }
}
