import { removeAccentsAndCedilla, sanitizeText, ErrorLogItem } from './planilha1_parser'

export interface WarehouseProductItem {
  spu: string
  sku: string
  color: string
  size: string
  product_name?: string
  image_url?: string
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

// 3. Processar Anúncios do Marketplace conforme Prompt 2 (Kits & Regras de Negócio)
export function processMarketplaceListings(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string = '',
  kitKeywords: string[] = ['kit', '+', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto']
): ParseMarketplaceResult {
  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []
  const processedKitSkusSet = new Set<string>()

  const cleanTargetSpu = targetSpu ? sanitizeText(targetSpu).toUpperCase() : ''

  // Filtrar produtos da base oficial se SPU for fornecido, senão usar toda a base do armazém
  const targetProducts = cleanTargetSpu
    ? warehouseProducts.filter(p => sanitizeText(p.spu).toUpperCase() === cleanTargetSpu)
    : warehouseProducts

  marketplaceRows.forEach(item => {
    const localErrors: ErrorLogItem[] = []
    const rawTitle = item.title || ''
    const titleLower = rawTitle.toLowerCase()
    // Higienização de título: remove espaços duplos e caracteres estranhos
    const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim()

    // Regra 1: Verificar se é "Conjunto" (Termos de Exceção não padronizados -> Pendentes)
    const isConjunto = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
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
        statusMarketplace: item.status || 'ativo',
        listingStatus: 'ignored_conjunto',
        detectedType: 'conjunto',
        generatedKitRows: [],
        errorLogs: [warningItem]
      })
      return
    }

    // Regra 2: Verificar se é Kit (Identificado pelas palavras-chave ou quantidade de kits)
    const isKitByKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const kitQty = parseKitQuantity(rawTitle)

    if (!isKitByKeyword && !kitQty) {
      // Anúncios simples ou não identificados como Kit não geram linhas de Kit
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status || 'ativo',
        listingStatus: 'standardized',
        detectedType: 'simple',
        generatedKitRows: [],
        errorLogs: []
      })
      return
    }

    const qtyTotal = kitQty || 2

    // Validação da imagem (Coluna AP na planilha importada)
    const imgUrl = (item.imageUrl || '').trim()

    // 1. Tentar identificar produto por correspondência direta de foto (Coluna AP) na base do Supabase
    let matchedByPhoto = false
    const skuQtyMap = new Map<string, { item: WarehouseProductItem; qty: number }>()

    if (imgUrl) {
      const photoMatch = targetProducts.find(p => p.image_url && p.image_url.trim() === imgUrl)
      if (photoMatch) {
        matchedByPhoto = true
        skuQtyMap.set(photoMatch.sku, { item: photoMatch, qty: qtyTotal })
      }
    }

    // 2. Se não encontrou por foto, faz a decomposição por Cores e Tamanho
    if (!matchedByPhoto) {
      const rawColorStr = item.colorRaw || ''
      const rawSizeStr = item.sizeRaw || 'U'

      let colorList = rawColorStr.split(/_|,|\+/).map(c => c.trim()).filter(Boolean)
      if (colorList.length === 0) {
        colorList = [rawColorStr || 'Unica']
      }

      if (colorList.length === 1 && qtyTotal > 1) {
        const singleColor = colorList[0]
        colorList = Array(qtyTotal).fill(singleColor)
      }

      let hasMatchingError = false

      for (const cName of colorList) {
        const normColor = normalizeForMatch(cName)
        const normSize = normalizeForMatch(rawSizeStr)

        const candidates = targetProducts.filter(p => {
          const pColorNorm = normalizeForMatch(p.color)
          const pSizeNorm = normalizeForMatch(p.size)
          return (pColorNorm === normColor || pColorNorm.includes(normColor) || normColor.includes(pColorNorm)) &&
                 (pSizeNorm === normSize || normSize === 'u' || pSizeNorm === 'u')
        })

        if (candidates.length === 0) {
          hasMatchingError = true
          localErrors.push({
            type: 'ERRO',
            clientRow: item.rowIdx,
            productName: rawTitle,
            field: 'Cor/Tamanho/Armazém',
            originalValue: `${cName} - ${rawSizeStr}`,
            correctedValue: '-',
            message: `Nenhum SKU oficial do armazém encontrado para '${cName} - ${rawSizeStr}'.`,
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

      if (hasMatchingError && skuQtyMap.size === 0) {
        localErrors.forEach(err => globalErrorLogs.push(err))
        allListings.push({
          listingId: item.listingId,
          title: rawTitle,
          cleanTitle,
          statusMarketplace: item.status || 'ativo',
          listingStatus: 'blocked_error',
          detectedType: 'kit',
          generatedKitRows: [],
          errorLogs: localErrors
        })
        return
      }
    }

    // Regra de Formação do Kit SKU:
    // KIT{QTD}-{SPU}-{CORES_ORDENADAS}-{TAMANHO}
    const consolidatedList = Array.from(skuQtyMap.values())
    const spuRef = cleanTargetSpu || (consolidatedList[0]?.item.spu ? sanitizeText(consolidatedList[0].item.spu).toUpperCase() : 'PRODUTO')

    const rawColorsList: string[] = []
    consolidatedList.forEach(({ item: pItem, qty }) => {
      const colorClean = removeAccentsAndCedilla(pItem.color || 'UNICA').replace(/ç/gi, 'c').trim()
      for (let i = 0; i < qty; i++) {
        rawColorsList.push(colorClean)
      }
    })

    // REGRA DE OURO: Cores OBRIGATORIAMENTE ordenadas em ORDEM ALFABÉTICA e separadas por underline "_"
    rawColorsList.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    const coresOrdenadas = rawColorsList.join('_')

    const sampleSize = consolidatedList[0]?.item.size || item.sizeRaw || 'U'
    const cleanSizeFormatted = removeAccentsAndCedilla(sampleSize).replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() || 'U'

    // Formato padrão: KIT{QTD}-{SPU}-{CORES_ORDENADAS}-{TAMANHO}
    let generatedKitSku = `KIT${qtyTotal}-${spuRef}-${coresOrdenadas}-${cleanSizeFormatted}`.replace(/\s+/g, '')

    // REGRA MÁXIMA DE 50 CARACTERES: Truncar em 50 caracteres caso ultrapasse
    if (generatedKitSku.length > 50) {
      generatedKitSku = generatedKitSku.slice(0, 50)
    }

    // PREVENÇÃO DE DUPLICIDADE: Omitir se o mesmo Kit SKU já tiver sido gerado neste lote
    if (processedKitSkusSet.has(generatedKitSku)) {
      allListings.push({
        listingId: item.listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: item.status || 'ativo',
        listingStatus: 'standardized',
        detectedType: 'kit',
        kitSku: generatedKitSku,
        generatedKitRows: [],
        errorLogs: []
      })
      return
    }

    processedKitSkusSet.add(generatedKitSku)

    const itemKitRows: GeneratedKitRow[] = []

    // DESMEMBRAMENTO DE COMPONENTES:
    // 1 linha para cada SKU componente individual com SKU Qnt. correspondente
    consolidatedList.forEach(({ item: pItem, qty }) => {
      const kitRow: GeneratedKitRow = {
        kitSku: generatedKitSku,
        title: cleanTitle,
        imageUrl: pItem.image_url || imgUrl,
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
      statusMarketplace: item.status || 'ativo',
      listingStatus: 'standardized',
      detectedType: 'kit',
      kitSku: generatedKitSku,
      generatedKitRows: itemKitRows,
      errorLogs: localErrors
    })
  })

  return { kitsRows, allListings, errorLogs: globalErrorLogs }
}
