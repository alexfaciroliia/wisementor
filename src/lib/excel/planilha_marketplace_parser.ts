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

export interface ErrorCenterKitItem {
  listingId: string
  title: string
  cleanTitle: string
  imageUrl: string
  statusMarketplace: string
  rows: MarketplaceListingRow[]
  identifiedSpus: string[]
  unmappedItems?: string[]
  totalItemsInPhoto?: number
  errorReason: 'incomplete_match' | 'no_match' | 'unmapped_items' | 'unreconciled_variation' | 'manual_review'
  errorMessage: string
  importedColors: string[]
  importedSizes: string[]
  availableColorsInWarehouse: string[]
  availableSizesInWarehouse: string[]
  unmatchedType?: 'color' | 'size' | 'both'
}

export interface ProcessedListingResult {
  listingId: string
  title: string
  cleanTitle: string
  statusMarketplace: string
  listingStatus: 'pending' | 'standardized' | 'ignored_conjunto' | 'ambiguous_error' | 'blocked_error' | 'unreconciled' | 'duplicate'
  detectedType: 'simple' | 'kit' | 'conjunto' | 'unknown'
  kitSku?: string
  generatedKitRows: GeneratedKitRow[]
  errorLogs: ErrorLogItem[]
}

export interface DuplicateKitListingItem {
  listingId: string
  title: string
  cleanTitle: string
  imageUrl: string
  statusMarketplace: string
  kitSku?: string
  duplicateOfListingId: string
  duplicateOfTitle: string
  generatedKitRows: GeneratedKitRow[]
  rawRows: MarketplaceListingRow[]
  reason: string
}

export interface ParseMarketplaceResult {
  kitsRows: GeneratedKitRow[]
  allListings: ProcessedListingResult[]
  errorLogs: ErrorLogItem[]
  errorCenterKits: ErrorCenterKitItem[]
  duplicateListings: DuplicateKitListingItem[]
  visionLogs?: VisionProcessingLog[]
}

// 1. Normalização para busca fuzzy tolerante
export function normalizeForMatch(str: string): string {
  if (!str) return ''
  let clean = removeAccentsAndCedilla(str).toLowerCase()
  clean = clean.replace(/ç/gi, 'c')
  clean = clean.replace(/\brelogo\b/gi, 'relogio').replace(/\brelojo\b/gi, 'relogio')
  clean = clean.replace(/\s+/g, ' ').trim()
  return clean
}

// 2. Extrair componentes do kit pelo título (separados por "+")
// Ex: "Kit Sapato Masculino + Relógio Digital + Cinto + Carteira"
//  -> ["Sapato Masculino", "Relógio Digital", "Cinto", "Carteira"]
export function extractKitComponents(title: string): string[] {
  const parts = title.split(/\+/)
  const components: string[] = []

  for (const part of parts) {
    let component = part.trim()
    // Remover prefixo "Kit " do primeiro componente
    component = component.replace(/^Kit\s+/i, '').trim()
    if (component.length > 1) {
      components.push(component)
    }
  }

  return components
}

// 3. Score de similaridade de texto para nomes de produtos e componentes
function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0

  const normA = normalizeForMatch(a)
  const normB = normalizeForMatch(b)

  // DISTINÇÃO CRUCIAL: Relógio Analógico NÃO PODE ser igualado a Relógio Digital!
  const isAAnalog = /analogico|analógico|ponteiro/i.test(normA)
  const isADigital = /digital|smartband|\bled\b/i.test(normA)
  const isBAnalog = /analogico|analógico|ponteiro/i.test(normB)
  const isBDigital = /digital|smartband|\bled\b/i.test(normB)

  if ((isAAnalog && isBDigital) || (isADigital && isBAnalog)) {
    return 0 // Impossibilita associação cruzada entre relógio analógico e digital
  }

  if (normA === normB) return 1.0
  if (normA.includes(normB) || normB.includes(normA)) {
    if ((isBAnalog || isBDigital) && !(isAAnalog || isADigital)) {
      return 0.4 // Reduz score se um produto é específico (Analógico/Digital) e o componente é genérico
    }
    return 0.85
  }

  const wordsA = normA.split(/\s+/).filter(w => w.length >= 2)
  const wordsB = normB.split(/\s+/).filter(w => w.length >= 2)
  if (wordsA.length === 0 || wordsB.length === 0) return 0

  let matches = 0
  for (const wa of wordsA) {
    if (wordsB.some(wb => wb.includes(wa) || wa.includes(wb))) matches++
  }

  const recall = matches / wordsA.length
  const precision = matches / wordsB.length
  const baseScore = (recall + precision) / 2

  if ((isBAnalog || isBDigital) && !(isAAnalog || isADigital)) {
    return baseScore * 0.5
  }

  return baseScore
}

import { ClientCategoryRule } from '@/lib/services/product_service'

// 4. Encontrar melhor produto no armazém para um componente do kit (100% Parametrizado)
function findBestProductForComponent(
  componentName: string,
  warehouseProducts: WarehouseProductItem[],
  categoryRules: ClientCategoryRule[] = [],
  knownUnmappedCategories: string[] = []
): WarehouseProductItem | null {
  if (!componentName || warehouseProducts.length === 0) return null

  const normComponent = componentName.toLowerCase()

  const isDigitalWatchComp = /digital|smartband|led|smartwatch/i.test(normComponent)
  const isAnalogWatchComp = /analogic|analógic|ponteiro/i.test(normComponent)
  const isWatchComp = normComponent.includes('reló') || isDigitalWatchComp || isAnalogWatchComp

  let bestScore = 0
  let bestProduct: WarehouseProductItem | null = null

  for (const product of warehouseProducts) {
    const pName = (product.product_name || '').toLowerCase()
    const pSpu = product.spu.toLowerCase()

    const isProdAnalog = /r40|analogic|analógic|ponteiro/i.test(pName) || /r40|analogic|analógic|ponteiro/i.test(pSpu)
    const isProdDigital = /v20|digital|smartband|led|smartwatch/i.test(pName) || /v20|digital|smartband|led|smartwatch/i.test(pSpu) || (!isProdAnalog && (pName.includes('reló') || pSpu.includes('reló')))

    if (isDigitalWatchComp && isProdAnalog) continue
    if (isAnalogWatchComp && isProdDigital) continue

    const nameScore = similarityScore(componentName, product.product_name || '')
    const spuScore = similarityScore(componentName, product.spu)
    let score = Math.max(nameScore, spuScore)

    // Se o componente pede especificamente Relógio Digital e o produto é digital/não-analógico:
    if (isDigitalWatchComp && isProdDigital) {
      score = Math.max(score, 0.85)
    }
    // Se o componente pede especificamente Relógio Analógico e o produto é analógico:
    if (isAnalogWatchComp && isProdAnalog) {
      score = Math.max(score, 0.85)
    }

    if (score > bestScore) {
      bestScore = score
      bestProduct = product
    }
  }

  if (bestScore >= 0.35) return bestProduct

  // Tentar busca através das Regras & Sinônimos de Categorias do Cliente
  for (const rule of categoryRules) {
    const matchesKeyword = rule.keywords.some(kw => normComponent.includes(kw.toLowerCase()))
    if (matchesKeyword) {
      const isExcluded = rule.exclude_keywords?.some(ex => normComponent.includes(ex.toLowerCase()))
      if (isExcluded) continue

      const matched = warehouseProducts.find(p => {
        const pSpu = p.spu.toUpperCase()
        const pName = (p.product_name || '').toLowerCase()

        const isProdAnalog = /analogic|analógic|ponteiro/i.test(pName) || /analogic|analógic|ponteiro/i.test(pSpu)
        const isProdDigital = /digital|smartband|led/i.test(pName) || /digital|smartband|led/i.test(pSpu)

        if (isDigitalWatchComp && isProdAnalog) return false
        if (isAnalogWatchComp && isProdDigital) return false

        const spuMatch = rule.spu_patterns?.some(pat => pSpu.includes(pat.toUpperCase()))
        const nameMatch = pName.includes(rule.category_name.toLowerCase()) || rule.keywords.some(kw => pName.includes(kw.toLowerCase()))

        const pIsExcluded = rule.exclude_keywords?.some(ex => pSpu.includes(ex.toUpperCase()) || pName.includes(ex.toLowerCase()))
        if (pIsExcluded) return false

        return spuMatch || nameMatch
      })

      if (matched) return matched
    }
  }

  return null
}

// 5. Ordenar SPUs do Kit (100% Parametrizado): Acessórios em Ordem Alfabética PRIMEIRO, Produto Principal por ÚLTIMO
export function orderKitSpus(
  componentSpus: string[],
  targetProducts: WarehouseProductItem[],
  categoryRules: ClientCategoryRule[] = []
): string {
  const accessories: string[] = []
  const mainProducts: string[] = []

  for (const spu of componentSpus) {
    const normSpu = spu.toUpperCase()
    const prods = targetProducts.filter(p => p.spu.toUpperCase() === normSpu || sanitizeText(p.spu).toUpperCase().replace(/\s+/g, '-') === normSpu)

    const rule = categoryRules.find(r => r.spu_patterns?.some(pat => normSpu.includes(pat.toUpperCase())))
    let isAccessory = rule?.is_accessory

    if (isAccessory === undefined) {
      const isMain = prods.some(p => {
        const normSize = (p.size || '').trim().toLowerCase()
        const normName = (p.product_name || p.spu || '').toLowerCase()
        const hasNumericSize = /\d+/.test(normSize) && normSize !== 'u' && normSize !== 'unico' && normSize !== 'unica'
        const isFootwear = /sapato|tenis|tênis|sapatilha|bota|tamanco|chinelo|sandalia|sandália|mocassim|slip|coturno/.test(normName)
        return hasNumericSize || isFootwear
      })
      isAccessory = !isMain
    }

    if (isAccessory) {
      if (!accessories.includes(spu)) accessories.push(spu)
    } else {
      if (!mainProducts.includes(spu)) mainProducts.push(spu)
    }
  }

  if (mainProducts.length === 0 || accessories.length === 0) {
    return componentSpus.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })).join('-')
  }

  accessories.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
  mainProducts.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))

  return [...accessories, ...mainProducts].join('-')
}

// 6. Buscar o SKU exato no Armazém Supabase cruzando SPU + Cor + Tamanho
export function findExactWarehouseSku(
  spu: string,
  cor: string,
  tam: string,
  targetProducts: WarehouseProductItem[]
): string {
  const normSpu = spu.toUpperCase()
  const cleanTamVal = tam.replace(/\s*BR\b/gi, '').replace(/\bBR\s*/gi, '').replace(/BR$/i, '').replace(/^BR/i, '').trim()
  const normCor = normalizeForMatch(cor)
  const normTam = normalizeForMatch(cleanTamVal)

  // 1. Busca exata por SPU + Cor + Tamanho (ou SKU contendo a cor e tamanho)
  const exactMatch = targetProducts.find(p => {
    const pSpu = p.spu.toUpperCase()
    const pCor = normalizeForMatch(p.color)
    const pTam = normalizeForMatch(p.size)
    const pSku = normalizeForMatch(p.sku)

    const spuMatches = pSpu === normSpu || pSku.startsWith(normalizeForMatch(spu))
    const corMatches = normCor && (pCor === normCor || pCor.includes(normCor) || normCor.includes(pCor) || pSku.includes(normCor))
    const tamMatches = normTam && (pTam === normTam || pTam.includes(normTam) || normTam.includes(pTam) || pSku.endsWith(normTam))

    return spuMatches && (corMatches || !normCor) && (tamMatches || !normTam)
  })

  if (exactMatch && exactMatch.sku) {
    return exactMatch.sku
  }

  // 2. Busca por SPU + Cor (caso o tamanho não esteja batendo exatamente)
  const spuColorMatch = targetProducts.find(p => {
    const pSpu = p.spu.toUpperCase()
    const pCor = normalizeForMatch(p.color)
    const pSku = normalizeForMatch(p.sku)
    const spuMatches = pSpu === normSpu || pSku.startsWith(normalizeForMatch(spu))
    const corMatches = normCor && (pCor === normCor || pCor.includes(normCor) || normCor.includes(pCor) || pSku.includes(normCor))
    return spuMatches && (corMatches || pCor === 'unica' || pCor === 'u' || normCor === 'unica')
  })

  if (spuColorMatch && spuColorMatch.sku) {
    if (cleanTamVal && cleanTamVal !== 'u' && cleanTamVal !== 'unica') {
      const skuParts = spuColorMatch.sku.split('-')
      if (skuParts.length >= 3) {
        skuParts[skuParts.length - 1] = cleanTamVal
        return skuParts.join('-')
      }
    }
    return spuColorMatch.sku
  }

  // 3. REGRA CRUCIAL SOLICITADA:
  // Se a cor do anúncio (ex: CHUMBO) não for encontrada no armazém (ex: só tem Azul Marinho cadastrado),
  // NUNCA retorne uma cor diferente (Azul Marinho)!
  // Monte o SKU oficial preservando rigorosamente a Cor (CHUMBO) e o Tamanho (ex: 43) da planilha importada.
  const spuBaseMatch = targetProducts.find(p => p.spu.toUpperCase() === normSpu)
  if (spuBaseMatch && spuBaseMatch.sku) {
    const baseParts = spuBaseMatch.sku.split('-')
    if (baseParts.length >= 2) {
      const formattedCor = cor ? (cor.charAt(0).toUpperCase() + cor.slice(1).toLowerCase()) : ''
      const formattedTam = cleanTamVal ? cleanTamVal : ''
      
      if (baseParts.length >= 3) {
        return `${baseParts[0]}-${formattedCor || baseParts[1]}-${formattedTam || baseParts[2]}`
      }
      return `${baseParts[0]}-${formattedCor}-${formattedTam}`.replace(/-+$/, '')
    }
  }

  // 4. Fallback final formatado com SPU + Cor da Planilha + Tamanho da Planilha sem 'BR'
  const formattedCor = cor ? (cor.charAt(0).toUpperCase() + cor.slice(1).toLowerCase()) : ''
  const formattedTam = cleanTamVal ? cleanTamVal : ''
  return [spu, formattedCor, formattedTam].filter(Boolean).join('-')
}

export function checkWarehouseColorSizeReconciliation(
  spu: string,
  cor: string,
  tam: string,
  targetProducts: WarehouseProductItem[]
): {
  isReconciled: boolean
  matchedColor?: string
  matchedSize?: string
  availableColors: string[]
  availableSizes: string[]
} {
  const normSpu = spu.toUpperCase()
  const cleanTamVal = tam.replace(/\s*BR\b/gi, '').replace(/\bBR\s*/gi, '').replace(/BR$/i, '').replace(/^BR/i, '').trim()
  const normCor = normalizeForMatch(cor)
  const normTam = normalizeForMatch(cleanTamVal)

  const spuProducts = targetProducts.filter(p => p.spu.toUpperCase() === normSpu)
  const availableColors = Array.from(new Set(spuProducts.map(p => p.color).filter(Boolean)))
  const availableSizes = Array.from(new Set(spuProducts.map(p => p.size).filter(Boolean)))

  if (spuProducts.length === 0 || availableColors.length === 0) {
    return { isReconciled: true, availableColors, availableSizes }
  }

  const matchedProd = spuProducts.find(p => {
    const pCor = normalizeForMatch(p.color)
    const pSku = normalizeForMatch(p.sku)
    return (pCor === normCor || (normCor && pCor.includes(normCor)) || (normCor && normCor.includes(pCor)) || (normCor && pSku.includes(normCor)))
  })

  return {
    isReconciled: Boolean(matchedProd),
    matchedColor: matchedProd?.color,
    matchedSize: cleanTamVal,
    availableColors,
    availableSizes
  }
}

// 7. Processar Anúncios do Marketplace conforme Prompt 2 (Kits & Regras de Negócio)
export function processMarketplaceListings(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string = '',
  kitKeywords: string[] = ['kit', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto'],
  categoryRules: ClientCategoryRule[] = []
): ParseMarketplaceResult {
  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []

  const listingsMap = new Map<string, MarketplaceListingRow[]>()
  for (const row of marketplaceRows) {
    const id = row.listingId
    if (!listingsMap.has(id)) listingsMap.set(id, [])
    listingsMap.get(id)!.push(row)
  }

  const cleanTargetSpu = targetSpu ? sanitizeText(targetSpu).toUpperCase() : ''
  const targetProducts = cleanTargetSpu
    ? warehouseProducts.filter(p => sanitizeText(p.spu).toUpperCase().includes(cleanTargetSpu))
    : warehouseProducts

  for (const [listingId, rows] of listingsMap) {
    const firstRow = rows[0]
    const rawTitle = firstRow.title || ''
    const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim()
    const titleLower = rawTitle.toLowerCase()

    const isConjunto = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isConjunto) {
      const warningItem: ErrorLogItem = {
        type: 'AVISO', clientRow: firstRow.rowIdx, productName: rawTitle,
        field: 'Tipo Anúncio', originalValue: rawTitle, correctedValue: 'PENDENTE (Conjunto)',
        message: 'Anúncio do tipo "Conjunto" identificado. Mantido como Pendente sem alterar SKU.',
        generatedFile: 'Kits', upSellerLineRange: '-'
      }
      globalErrorLogs.push(warningItem)
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'ignored_conjunto', detectedType: 'conjunto', generatedKitRows: [], errorLogs: [warningItem] })
      continue
    }

    const hasKitKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlusSeparator = rawTitle.includes('+')
    const isKit = hasKitKeyword || hasPlusSeparator

    if (!isKit) {
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'simple', generatedKitRows: [], errorLogs: [] })
      continue
    }

    const kitComponents = extractKitComponents(rawTitle)
    const componentSPUs: string[] = []
    const localErrors: ErrorLogItem[] = []

    for (const componentName of kitComponents) {
      const found = findBestProductForComponent(componentName, targetProducts, categoryRules)
      if (found) {
        const cleanSpu = sanitizeText(found.spu).toUpperCase().replace(/\s+/g, '-')
        if (!componentSPUs.includes(cleanSpu)) componentSPUs.push(cleanSpu)
      } else {
        const errItem: ErrorLogItem = {
          type: 'ERRO',
          clientRow: firstRow.rowIdx,
          productName: rawTitle,
          field: 'Componente Não Localizado no Supabase',
          originalValue: componentName,
          correctedValue: '-',
          message: `Componente '${componentName}' do anúncio (${listingId}) não foi encontrado no armazém Supabase. Cadastre o produto no armazém.`,
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        }
        globalErrorLogs.push(errItem)
        localErrors.push(errItem)
      }
    }

    // REGRA SOLICITADA: Kits com ERROS (componentes não mapeados) NÃO constam na Formação dos Kits!
    if (componentSPUs.length === 0 || localErrors.some(e => e.type === 'ERRO')) {
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'blocked_error', detectedType: 'kit', generatedKitRows: [], errorLogs: localErrors })
      continue
    }

    const spuPart = orderKitSpus(componentSPUs, targetProducts, categoryRules)
    const itemKitRows: GeneratedKitRow[] = []

    for (const variationRow of rows) {
      const cor = (variationRow.colorRaw || '').trim()
      const rawTam = (variationRow.sizeRaw || 'U').trim()
      // Desconsiderar "BR" do tamanho (exemplo: 37BR -> 37)
      const tam = rawTam.replace(/\s*BR\b/gi, '').replace(/\bBR\s*/gi, '').replace(/BR$/i, '').replace(/^BR/i, '').trim() || 'U'

      const cleanCor = removeAccentsAndCedilla(cor).replace(/ç/gi, 'c').replace(/\s+/g, '').toUpperCase() || 'UNICA'
      const cleanTam = removeAccentsAndCedilla(tam).replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() || 'U'

      let kitSku = `KIT-${spuPart}-${cleanCor}-${cleanTam}`.replace(/\s+/g, '')
      if (kitSku.length > 50) kitSku = kitSku.slice(0, 50)

      // Regra 4: Foto da planilha de anúncios do UpSeller (coluna AP da linha correspondente)
      const imgForRow = (variationRow.imageUrl || firstRow.imageUrl || '').trim()

      for (const compSpu of componentSPUs) {
        const officialSku = findExactWarehouseSku(compSpu, cor, tam, targetProducts)
        const kitRow: GeneratedKitRow = {
          kitSku,
          title: cleanTitle,
          imageUrl: imgForRow, // Imagem da coluna AP do UpSeller
          sku: officialSku,    // SKU exato do armazém no Supabase cruzando SPU+Cor+Tamanho
          skuQty: 1
        }
        kitsRows.push(kitRow)
        itemKitRows.push(kitRow)
      }
    }

    allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'kit', kitSku: itemKitRows[0]?.kitSku, generatedKitRows: itemKitRows, errorLogs: [] })
  }

  return { kitsRows, allListings, errorLogs: globalErrorLogs, errorCenterKits: [], duplicateListings: [] }
}

// ──────────────────────────────────────────────────────────────────────────────
// VISION AI INTEGRATION & BUILD KIT ROWS HELPER
// ──────────────────────────────────────────────────────────────────────────────

export type VisionIdentifyFn = (
  imageUrl: string,
  products: WarehouseProductItem[],
  titleHint?: string
) => Promise<string[] | { identifiedSpus: string[]; unmappedItems?: string[]; totalItemsInPhoto?: number }>

export interface VisionProcessingLog {
  listingId: string
  title: string
  imageUrl: string
  visionSpus: string[]
  visionConfidence: string
  fallbackUsed: boolean
  fallbackReason?: string
}

export function buildKitRowsForListing(
  listing: { listingId: string; title: string; imageUrl?: string; rows: MarketplaceListingRow[] },
  componentSpus: string[],
  targetProducts: WarehouseProductItem[],
  categoryRules: ClientCategoryRule[] = [],
  colorOverride?: string
): { generatedRows: GeneratedKitRow[]; kitSku: string } {
  const updatedRows: GeneratedKitRow[] = []
  const cleanTitle = (listing.title || '').replace(/\s+/g, ' ').trim()
  const spus = componentSpus.length > 0 ? componentSpus : ['PRODUTO']
  const spuPart = orderKitSpus(spus, targetProducts, categoryRules)

  for (const variationRow of listing.rows) {
    const rowCorRaw = (variationRow.colorRaw || '').trim()
    const rawTam = (variationRow.sizeRaw || 'U').trim()
    const tam = rawTam.replace(/\s*BR\b/gi, '').replace(/\bBR\s*/gi, '').replace(/BR$/i, '').replace(/^BR/i, '').trim() || 'U'

    // Verificar se a cor original da variação já bate com o armazém ou se usa override do de-para
    const checkRes = checkWarehouseColorSizeReconciliation(spus[0] || '', rowCorRaw, tam, targetProducts)
    const rowColor = (checkRes.isReconciled && checkRes.matchedColor) ? checkRes.matchedColor : (colorOverride || rowCorRaw || 'UNICA')

    const cleanCor = removeAccentsAndCedilla(rowColor).replace(/ç/gi, 'c').replace(/\s+/g, '').toUpperCase() || 'UNICA'
    const cleanTam = removeAccentsAndCedilla(tam).replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() || 'U'

    let kitSku = `KIT-${spuPart}-${cleanCor}-${cleanTam}`.replace(/\s+/g, '')
    if (kitSku.length > 50) kitSku = kitSku.slice(0, 50)

    const imgForRow = (variationRow.imageUrl || listing.imageUrl || '').trim()

    for (const compSpu of spus) {
      const officialWarehouseSku = findExactWarehouseSku(compSpu, rowColor, tam, targetProducts)
      const kitRow: GeneratedKitRow = {
        kitSku,
        title: cleanTitle,
        imageUrl: imgForRow,
        sku: officialWarehouseSku,
        skuQty: 1
      }
      updatedRows.push(kitRow)
    }
  }

  return {
    generatedRows: updatedRows,
    kitSku: updatedRows[0]?.kitSku || `KIT-${spuPart}`
  }
}

export async function processMarketplaceListingsWithVision(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string = '',
  kitKeywords: string[] = ['kit', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto'],
  visionFn?: VisionIdentifyFn,
  onProgress?: (current: number, total: number, listingId: string) => void,
  categoryRules: ClientCategoryRule[] = []
): Promise<ParseMarketplaceResult & { visionLogs: VisionProcessingLog[] }> {

  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []
  const visionLogs: VisionProcessingLog[] = []
  const errorCenterKits: ErrorCenterKitItem[] = []
  const duplicateListings: DuplicateKitListingItem[] = []
  const seenKitSkusMap = new Map<string, { listingId: string; title: string }>()

  const listingsMap = new Map<string, MarketplaceListingRow[]>()
  for (const row of marketplaceRows) {
    const id = row.listingId
    if (!listingsMap.has(id)) listingsMap.set(id, [])
    listingsMap.get(id)!.push(row)
  }

  const targetProducts = warehouseProducts

  const allEntries = [...listingsMap.entries()]
  const kitEntries = allEntries.filter(([, rows]) => {
    const titleLower = (rows[0].title || '').toLowerCase()
    const isIgnored = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isIgnored) return false
    const hasKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlus = (rows[0].title || '').includes('+')
    return hasKeyword || hasPlus
  })

  const imageVisionCache = new Map<string, { identified: string[]; unmapped: string[]; totalInPhoto: number }>()
  let kitIdx = 0

  for (const [listingId, rows] of allEntries) {
    const firstRow = rows[0]
    const rawTitle = firstRow.title || ''
    const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim()
    const titleLower = rawTitle.toLowerCase()

    const isConjunto = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isConjunto) {
      const warningItem: ErrorLogItem = {
        type: 'AVISO', clientRow: firstRow.rowIdx, productName: rawTitle,
        field: 'Tipo Anúncio', originalValue: rawTitle, correctedValue: 'PENDENTE (Conjunto)',
        message: 'Anúncio do tipo "Conjunto" identificado. Mantido como Pendente sem alterar SKU.',
        generatedFile: 'Kits', upSellerLineRange: '-'
      }
      globalErrorLogs.push(warningItem)
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'ignored_conjunto', detectedType: 'conjunto', generatedKitRows: [], errorLogs: [warningItem] })
      continue
    }

    const hasKitKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlusSeparator = rawTitle.includes('+')
    const isKit = hasKitKeyword || hasPlusSeparator

    if (!isKit) {
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'simple', generatedKitRows: [], errorLogs: [] })
      continue
    }

    kitIdx++
    onProgress?.(kitIdx, kitEntries.length, listingId)

    const imgUrl = (firstRow.imageUrl || '').trim()
    let componentSPUs: string[] = []
    let visionUsed = false
    let fallbackUsed = false
    let fallbackReason = ''
    let visionConfidence = 'none'
    const knownUnmapped: string[] = []
    let totalItemsInPhoto = 0

    // 1. Identificar estritamente por fotos usando Vision AI
    if (visionFn && imgUrl) {
      try {
        if (imageVisionCache.has(imgUrl)) {
          const cached = imageVisionCache.get(imgUrl)!
          componentSPUs = [...cached.identified]
          if (cached.unmapped && cached.unmapped.length > 0) {
            knownUnmapped.push(...cached.unmapped)
          }
          totalItemsInPhoto = cached.totalInPhoto || (componentSPUs.length + knownUnmapped.length)
          visionUsed = true
          visionConfidence = 'cached'
        }
        
        if (!visionUsed) {
          const res = await visionFn(imgUrl, targetProducts, rawTitle)
          let identified: string[] = []
          let unmapped: string[] = []
          let totalCount = 0

          if (Array.isArray(res)) {
            identified = res
            totalCount = res.length
          } else if (res && typeof res === 'object') {
            identified = res.identifiedSpus || []
            if (res.unmappedItems && res.unmappedItems.length > 0) {
              unmapped = [...res.unmappedItems]
              knownUnmapped.push(...res.unmappedItems)
            }
            totalCount = res.totalItemsInPhoto || (identified.length + unmapped.length)
          }

          imageVisionCache.set(imgUrl, { identified, unmapped, totalInPhoto: totalCount })
          visionUsed = true
          componentSPUs = [...identified]
          totalItemsInPhoto = totalCount
          visionConfidence = (identified.length >= 2 && unmapped.length === 0) ? 'high' : identified.length >= 1 ? 'medium' : 'low'
        }
      } catch (visionErr: any) {
        fallbackReason = `Vision error: ${visionErr.message}`
      }
    }

    const currentImgUrl = (firstRow.imageUrl || '').trim()
    const importedColors = Array.from(new Set(rows.map(r => (r.colorRaw || '').trim()).filter(Boolean)))
    const importedSizes = Array.from(new Set(rows.map(r => (r.sizeRaw || '').trim()).filter(Boolean)))

    // Coletar cores e tamanhos disponíveis no armazém para os SPUs identificados
    const availableWarehouseProds = targetProducts.filter(p => componentSPUs.includes(p.spu.toUpperCase()))
    const availableColorsInWarehouse = Array.from(new Set(availableWarehouseProds.map(p => p.color).filter(Boolean)))
    const availableSizesInWarehouse = Array.from(new Set(availableWarehouseProds.map(p => p.size).filter(Boolean)))

    visionLogs.push({
      listingId,
      title: rawTitle,
      imageUrl: imgUrl,
      visionSpus: visionUsed ? componentSPUs : [],
      visionConfidence,
      fallbackUsed,
      fallbackReason: fallbackUsed ? fallbackReason : undefined
    })

    // 2. VERIFICAÇÃO DE ERROS E IDENTIFICAÇÕES INCOMPLETAS
    // Exemplo do usuário:
    // - 3 produtos na foto e identificou 3 idênticos -> Formação dos Kits
    // - 3 produtos na foto e identificou 1, 2 ou nenhum -> Central de Erros
    // - Produto na foto que não existe no armazém (unmapped) -> Central de Erros
    const hasZeroMatch = componentSPUs.length === 0
    const hasUnmapped = knownUnmapped.length > 0
    const hasPartialMatch = totalItemsInPhoto > 0 && totalItemsInPhoto > componentSPUs.length

    if (hasZeroMatch || hasUnmapped || hasPartialMatch) {
      let errorReason: ErrorCenterKitItem['errorReason'] = 'incomplete_match'
      let errorMessage = ''

      if (hasZeroMatch) {
        errorReason = 'no_match'
        errorMessage = 'Nenhum produto idêntico da foto foi encontrado no armazém Supabase. Identifique os produtos manualmente.'
      } else if (hasUnmapped) {
        errorReason = 'unmapped_items'
        errorMessage = `A foto exibe produto(s) sem cadastro no armazém: ${knownUnmapped.join(', ')}. Adicione o produto correspondente.`
      } else {
        errorReason = 'incomplete_match'
        errorMessage = `A foto exibe ${totalItemsInPhoto} produtos, mas apenas ${componentSPUs.length} foram identificados (${componentSPUs.join(', ')}). Identifique o(s) produto(s) faltante(s).`
      }

      const errItem: ErrorLogItem = {
        type: 'ERRO',
        clientRow: firstRow.rowIdx,
        productName: rawTitle,
        field: 'Identificação de Fotos do Kit',
        originalValue: imgUrl || rawTitle,
        correctedValue: '-',
        message: errorMessage,
        generatedFile: 'Kits',
        upSellerLineRange: '-',
        imageUrl: currentImgUrl
      }
      globalErrorLogs.push(errItem)

      errorCenterKits.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        imageUrl: currentImgUrl,
        statusMarketplace: firstRow.status || 'ativo',
        rows,
        identifiedSpus: [...componentSPUs],
        unmappedItems: knownUnmapped.length > 0 ? [...knownUnmapped] : undefined,
        totalItemsInPhoto,
        errorReason,
        errorMessage,
        importedColors,
        importedSizes,
        availableColorsInWarehouse,
        availableSizesInWarehouse
      })

      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'blocked_error',
        detectedType: 'kit',
        generatedKitRows: [],
        errorLogs: [errItem]
      })

      continue
    }

    // 3. VERIFICAÇÃO DE CONCILIAÇÃO DE VARIAÇÕES (COR/TAMANHO)
    let isUnreconciled = false
    let unreconciledDetail: { spu: string; importedColor: string; importedSize: string; availableColors: string[]; availableSizes: string[]; unmatchedType: 'color' | 'size' | 'both' } | null = null

    for (const variationRow of rows) {
      const cor = (variationRow.colorRaw || '').trim()
      const rawTam = (variationRow.sizeRaw || 'U').trim()
      const tam = rawTam.replace(/\s*BR\b/gi, '').replace(/\bBR\s*/gi, '').replace(/BR$/i, '').replace(/^BR/i, '').trim() || 'U'

      for (const compSpu of componentSPUs) {
        const checkRes = checkWarehouseColorSizeReconciliation(compSpu, cor, tam, targetProducts)
        if (!checkRes.isReconciled) {
          isUnreconciled = true
          unreconciledDetail = {
            spu: compSpu,
            importedColor: cor,
            importedSize: tam,
            availableColors: checkRes.availableColors,
            availableSizes: checkRes.availableSizes,
            unmatchedType: 'color'
          }
          break
        }
      }
      if (isUnreconciled) break
    }

    if (isUnreconciled && unreconciledDetail) {
      const varErrItem: ErrorLogItem = {
        type: 'ERRO',
        clientRow: firstRow.rowIdx,
        productName: rawTitle,
        field: 'Variação Não Encontrada no Armazém',
        originalValue: unreconciledDetail.importedColor,
        correctedValue: '-',
        message: `A cor '${unreconciledDetail.importedColor}' do anúncio não possui correspondência cadastrada no armazém Supabase para o SPU '${unreconciledDetail.spu}'.`,
        generatedFile: 'Kits',
        upSellerLineRange: '-',
        imageUrl: currentImgUrl
      }
      globalErrorLogs.push(varErrItem)

      errorCenterKits.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        imageUrl: currentImgUrl,
        statusMarketplace: firstRow.status || 'ativo',
        rows,
        identifiedSpus: [...componentSPUs],
        totalItemsInPhoto,
        errorReason: 'unreconciled_variation',
        errorMessage: `A variação de cor '${unreconciledDetail.importedColor}' precisa de de-para para ser conciliada com o armazém.`,
        importedColors,
        importedSizes,
        availableColorsInWarehouse: unreconciledDetail.availableColors,
        availableSizesInWarehouse: unreconciledDetail.availableSizes,
        unmatchedType: unreconciledDetail.unmatchedType
      })

      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'unreconciled',
        detectedType: 'kit',
        generatedKitRows: [],
        errorLogs: [varErrItem]
      })

      continue
    }

    // 4. FORMAÇÃO AUTOMÁTICA DO KIT COM 100% DE IDENTIFICAÇÃO E CONCILIAÇÃO
    const { generatedRows, kitSku } = buildKitRowsForListing(
      { listingId, title: rawTitle, imageUrl: currentImgUrl, rows },
      componentSPUs,
      targetProducts,
      categoryRules
    )

    // 5. VERIFICAÇÃO DE ANÚNCIOS DUPLICADOS (MESMOS SKUS DE KITS)
    // O primeiro anúncio permanece na aba "Formação dos Kits".
    // Os anúncios subsequentes com os mesmos SKUs são enviados para a aba "Duplicados".
    const firstMatchingDup = generatedRows.find(r => seenKitSkusMap.has(r.kitSku))
    const duplicateOf = firstMatchingDup ? seenKitSkusMap.get(firstMatchingDup.kitSku) : null

    if (duplicateOf && duplicateOf.listingId !== listingId) {
      const dupItem: DuplicateKitListingItem = {
        listingId,
        title: rawTitle,
        cleanTitle,
        imageUrl: currentImgUrl,
        statusMarketplace: firstRow.status || 'ativo',
        kitSku,
        duplicateOfListingId: duplicateOf.listingId,
        duplicateOfTitle: duplicateOf.title,
        generatedKitRows: generatedRows,
        rawRows: rows,
        reason: `Este anúncio gerou SKUs de Kit idênticos ao anúncio anterior "${duplicateOf.listingId}".`
      }
      duplicateListings.push(dupItem)

      const dupLog: ErrorLogItem = {
        type: 'AVISO',
        clientRow: firstRow.rowIdx,
        productName: rawTitle,
        field: 'Anúncio Duplicado',
        originalValue: rawTitle,
        correctedValue: `Duplicado de ${duplicateOf.listingId}`,
        message: `Anúncio duplicado com os mesmos SKUs de kit do anúncio ${duplicateOf.listingId}. Movido para a aba Duplicados.`,
        generatedFile: 'Kits',
        upSellerLineRange: '-',
        imageUrl: currentImgUrl
      }
      globalErrorLogs.push(dupLog)

      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'duplicate',
        detectedType: 'kit',
        kitSku,
        generatedKitRows: generatedRows,
        errorLogs: [dupLog]
      })

      continue
    }

    // Registrar SKUs gerados pelo primeiro anúncio para controle de duplicatas
    generatedRows.forEach(r => {
      if (r.kitSku && !seenKitSkusMap.has(r.kitSku)) {
        seenKitSkusMap.set(r.kitSku, { listingId, title: rawTitle })
      }
    })
    if (kitSku && !seenKitSkusMap.has(kitSku)) {
      seenKitSkusMap.set(kitSku, { listingId, title: rawTitle })
    }

    kitsRows.push(...generatedRows)

    allListings.push({
      listingId,
      title: rawTitle,
      cleanTitle,
      statusMarketplace: firstRow.status || 'ativo',
      listingStatus: 'standardized',
      detectedType: 'kit',
      kitSku,
      generatedKitRows: generatedRows,
      errorLogs: []
    })
  }

  return { kitsRows, allListings, errorLogs: globalErrorLogs, visionLogs, errorCenterKits, duplicateListings }
}
