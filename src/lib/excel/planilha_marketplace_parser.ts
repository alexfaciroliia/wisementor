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

export interface UnreconciledListingItem {
  listingId: string
  title: string
  imageUrl: string
  spu: string
  componentSPUs: string[]
  importedColor: string
  importedSize: string
  availableColorsInWarehouse: string[]
  availableSizesInWarehouse: string[]
  unmatchedType: 'color' | 'size' | 'both'
  rows: MarketplaceListingRow[]
}

export interface ProcessedListingResult {
  listingId: string
  title: string
  cleanTitle: string
  statusMarketplace: string
  listingStatus: 'pending' | 'standardized' | 'ignored_conjunto' | 'ambiguous_error' | 'blocked_error' | 'unreconciled'
  detectedType: 'simple' | 'kit' | 'conjunto' | 'unknown'
  kitSku?: string
  generatedKitRows: GeneratedKitRow[]
  errorLogs: ErrorLogItem[]
}

export interface ParseMarketplaceResult {
  kitsRows: GeneratedKitRow[]
  allListings: ProcessedListingResult[]
  errorLogs: ErrorLogItem[]
  unreconciledItems?: UnreconciledListingItem[]
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

  return { kitsRows, allListings, errorLogs: globalErrorLogs }
}

// ──────────────────────────────────────────────────────────────────────────────
// VISION AI INTEGRATION
// ──────────────────────────────────────────────────────────────────────────────

export type VisionIdentifyFn = (
  imageUrl: string,
  products: WarehouseProductItem[],
  titleHint?: string
) => Promise<string[] | { identifiedSpus: string[]; unmappedItems?: string[] }>

export interface VisionProcessingLog {
  listingId: string
  title: string
  imageUrl: string
  visionSpus: string[]
  visionConfidence: string
  fallbackUsed: boolean
  fallbackReason?: string
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
  const unreconciledItems: UnreconciledListingItem[] = []

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

  const imageVisionCache = new Map<string, { identified: string[]; unmapped: string[] }>()
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

    // 1. Tentar identificar por Vision AI
    if (visionFn && imgUrl) {
      try {
        if (imageVisionCache.has(imgUrl)) {
          const cached = imageVisionCache.get(imgUrl)!
          if (cached.identified.length > 0 || (cached.unmapped && cached.unmapped.length > 0)) {
            componentSPUs = [...cached.identified]
            if (cached.unmapped && cached.unmapped.length > 0) {
              knownUnmapped.push(...cached.unmapped)
            }
            visionUsed = true
            visionConfidence = 'cached'
          }
        }
        
        if (!visionUsed) {
          const res = await visionFn(imgUrl, targetProducts, rawTitle)
          let identified: string[] = []
          let unmapped: string[] = []
          if (Array.isArray(res)) {
            identified = res
          } else if (res && typeof res === 'object') {
            identified = res.identifiedSpus || []
            if (res.unmappedItems && res.unmappedItems.length > 0) {
              unmapped = [...res.unmappedItems]
              knownUnmapped.push(...res.unmappedItems)
            }
          }

          if (identified.length > 0 || unmapped.length > 0) {
            imageVisionCache.set(imgUrl, { identified, unmapped })
            visionUsed = true
            visionConfidence = identified.length >= 2 ? 'high' : identified.length === 1 ? 'medium' : 'low'
            if (identified.length > 0) {
              componentSPUs = [...identified]
            }
          }
        }
      } catch (visionErr: any) {
        fallbackReason = `Vision error: ${visionErr.message}`
      }
    }

    const localErrors: ErrorLogItem[] = []
    const currentImgUrl = (firstRow.imageUrl || '').trim()

    // Registra erros para itens que a Visão AI identificou na foto mas que não possuem SPU no armazém
    for (const unmapped of knownUnmapped) {
      const errItem: ErrorLogItem = {
        type: 'ERRO',
        clientRow: firstRow.rowIdx,
        productName: rawTitle,
        field: 'Componente Não Localizado no Supabase',
        originalValue: unmapped,
        correctedValue: '-',
        message: `Componente '${unmapped}' identificado na imagem do anúncio (${listingId}) não foi encontrado no armazém Supabase. Identifique e cadastre a variação correta no armazém.`,
        generatedFile: 'Kits',
        upSellerLineRange: '-',
        imageUrl: currentImgUrl
      }
      globalErrorLogs.push(errItem)
      localErrors.push(errItem)
    }

    // 2. EXTRAÇÃO E VALIDAÇÃO DE COMPONENTES:
    // Quando a Visão AI é utilizada, a identificação é 100% BASEADA EM FOTOS.
    // O título do anúncio é 100% descartado. Não fazemos nenhuma validação de texto por palavras do título.
    // IMPORTANTE: Se a Visão AI foi chamada mas retornou 0 SPUs (falha de download de imagem ou IA incerta),
    // tratamos como AVISO (sem kit formado), mas NÃO como ERRO bloqueante gerado pelo título.
    if (!visionUsed) {
      const titleComponents = extractKitComponents(rawTitle)
      // Fallback: se a Visão AI NÃO foi chamada, extraímos produtos a partir das palavras do título
      for (const compName of titleComponents) {
        const found = findBestProductForComponent(compName, targetProducts, categoryRules, knownUnmapped)
        if (found) {
          const cleanSpu = sanitizeText(found.spu).toUpperCase().replace(/\s+/g, '-')
          if (!componentSPUs.includes(cleanSpu)) {
            componentSPUs.push(cleanSpu)
          }
        } else {
          const alreadyLogged = localErrors.some(e => e.originalValue === compName || e.message.includes(compName))
          if (!alreadyLogged) {
            const unmappedItem: ErrorLogItem = {
              type: 'ERRO',
              clientRow: firstRow.rowIdx,
              productName: rawTitle,
              field: 'Componente Não Localizado no Supabase',
              originalValue: compName,
              correctedValue: '-',
              message: `Componente '${compName}' do anúncio (${listingId}) não foi encontrado no armazém Supabase. Identifique e cadastre o produto no armazém.`,
              generatedFile: 'Kits',
              upSellerLineRange: '-',
              imageUrl: currentImgUrl
            }
            globalErrorLogs.push(unmappedItem)
            localErrors.push(unmappedItem)
          }
        }
      }
      fallbackUsed = true
      fallbackReason = fallbackReason || (!imgUrl ? 'Sem URL de imagem' : !visionFn ? 'Vision AI não configurada' : 'Vision retornou 0 resultados')
    }

    visionLogs.push({
      listingId,
      title: rawTitle,
      imageUrl: imgUrl,
      visionSpus: visionUsed ? componentSPUs : [],
      visionConfidence,
      fallbackUsed,
      fallbackReason: fallbackUsed ? fallbackReason : undefined
    })

    const hasError = localErrors.some(e => e.type === 'ERRO') || knownUnmapped.length > 0

    if (componentSPUs.length === 0 || hasError) {
      if (componentSPUs.length === 0 && !hasError) {
        const emptyError: ErrorLogItem = {
          type: 'AVISO', clientRow: firstRow.rowIdx, productName: rawTitle,
          field: 'Componentes do Kit', originalValue: imgUrl || rawTitle, correctedValue: '-',
          message: `Nenhum produto do kit foi encontrado no armazém Supabase. Cadastre os produtos no armazém.`,
          generatedFile: 'Kits', upSellerLineRange: '-',
          imageUrl: currentImgUrl
        }
        globalErrorLogs.push(emptyError)
        localErrors.push(emptyError)
      }
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'blocked_error', detectedType: 'kit', generatedKitRows: [], errorLogs: localErrors })
      continue
    }

    // Regra 2: Ordenar SPUs (Acessórios Alfabéticos PRIMEIRO, Produto Principal por ÚLTIMO)
    const spuPart = orderKitSpus(componentSPUs, targetProducts, categoryRules)
    const itemKitRows: GeneratedKitRow[] = []

    // 3. VERIFICAR CONCILIAÇÃO DE COR/TAMANHO PARA A NOVA ABA DE AJUSTES
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
      unreconciledItems.push({
        listingId,
        title: rawTitle,
        imageUrl: (firstRow.imageUrl || '').trim(),
        spu: unreconciledDetail.spu,
        componentSPUs: [...componentSPUs],
        importedColor: unreconciledDetail.importedColor,
        importedSize: unreconciledDetail.importedSize,
        availableColorsInWarehouse: unreconciledDetail.availableColors,
        availableSizesInWarehouse: unreconciledDetail.availableSizes,
        unmatchedType: unreconciledDetail.unmatchedType,
        rows
      })
      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'unreconciled',
        detectedType: 'kit',
        generatedKitRows: [],
        errorLogs: localErrors
      })
      continue
    }

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

      // Regra 3: Buscar o SKU exato no Armazém Supabase cruzando SPU+Cor+Tamanho
      for (const compSpu of componentSPUs) {
        const officialWarehouseSku = findExactWarehouseSku(compSpu, cor, tam, targetProducts)
        const kitRow: GeneratedKitRow = {
          kitSku,
          title: cleanTitle,
          imageUrl: imgForRow,        // Foto da coluna AP do UpSeller da variação correspondente
          sku: officialWarehouseSku,  // SKU exato do armazém no Supabase para a variação (SPU+Cor+Tamanho)
          skuQty: 1
        }
        kitsRows.push(kitRow)
        itemKitRows.push(kitRow)
      }
    }

    allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'kit', kitSku: itemKitRows[0]?.kitSku, generatedKitRows: itemKitRows, errorLogs: localErrors })
  }

  return { kitsRows, allListings, errorLogs: globalErrorLogs, visionLogs, unreconciledItems }
}
