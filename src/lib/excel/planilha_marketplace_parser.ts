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

// 1. Normalização para busca fuzzy tolerante
export function normalizeForMatch(str: string): string {
  if (!str) return ''
  let clean = removeAccentsAndCedilla(str).toLowerCase()
  clean = clean.replace(/ç/gi, 'c')
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

// 3. Score de similaridade entre dois textos (0 a 1)
function similarityScore(a: string, b: string): number {
  const normA = normalizeForMatch(a)
  const normB = normalizeForMatch(b)

  // DISTINÇÃO CRUCIAL: Relógio Analógico NÃO PODE ser igualado a Relógio Digital!
  const isAAnalog = /analogico|analógico/i.test(normA)
  const isADigital = /digital/i.test(normA)
  const isBAnalog = /analogico|analógico/i.test(normB)
  const isBDigital = /digital/i.test(normB)

  if ((isAAnalog && isBDigital) || (isADigital && isBAnalog)) {
    return 0 // Impossibilita associação cruzada entre relógio analógico e digital
  }

  if (normA === normB) return 1.0
  if (normA.includes(normB) || normB.includes(normA)) return 0.85

  const wordsA = normA.split(/\s+/).filter(w => w.length >= 2)
  const wordsB = normB.split(/\s+/).filter(w => w.length >= 2)
  if (wordsA.length === 0 || wordsB.length === 0) return 0

  let matches = 0
  for (const wa of wordsA) {
    if (wordsB.some(wb => wb.includes(wa) || wa.includes(wb))) matches++
  }

  const recall = matches / wordsA.length
  const precision = matches / wordsB.length
  return (recall + precision) / 2
}

import { ClientCategoryRule } from '@/lib/services/product_service'

// 4. Encontrar melhor produto no armazém para um componente do kit (100% Parametrizado)
function findBestProductForComponent(
  componentName: string,
  warehouseProducts: WarehouseProductItem[],
  categoryRules: ClientCategoryRule[] = []
): WarehouseProductItem | null {
  if (!componentName || warehouseProducts.length === 0) return null

  let bestScore = 0
  let bestProduct: WarehouseProductItem | null = null

  for (const product of warehouseProducts) {
    const nameScore = similarityScore(componentName, product.product_name || '')
    const spuScore = similarityScore(componentName, product.spu)
    const score = Math.max(nameScore, spuScore)

    if (score > bestScore) {
      bestScore = score
      bestProduct = product
    }
  }

  if (bestScore >= 0.25) return bestProduct

  // Tentar busca através das Regras & Sinônimos de Categorias do Cliente
  const normComponent = componentName.toLowerCase()

  for (const rule of categoryRules) {
    const matchesKeyword = rule.keywords.some(kw => normComponent.includes(kw.toLowerCase()))
    if (matchesKeyword) {
      const isExcluded = rule.exclude_keywords?.some(ex => normComponent.includes(ex.toLowerCase()))
      if (isExcluded) continue

      const matched = warehouseProducts.find(p => {
        const pSpu = p.spu.toUpperCase()
        const pName = (p.product_name || '').toLowerCase()

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
function orderKitSpus(
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
function findExactWarehouseSku(
  spu: string,
  cor: string,
  tam: string,
  targetProducts: WarehouseProductItem[]
): string {
  const normSpu = spu.toUpperCase()
  const normCor = normalizeForMatch(cor)
  const normTam = normalizeForMatch(tam)

  // 1. Busca exata por SPU + Cor + Tamanho
  const exactMatch = targetProducts.find(p => {
    const pSpu = p.spu.toUpperCase()
    const pCor = normalizeForMatch(p.color)
    const pTam = normalizeForMatch(p.size)
    return pSpu === normSpu &&
           (pCor === normCor || pCor.includes(normCor) || normCor.includes(pCor)) &&
           (pTam === normTam || pTam.includes(normTam) || normTam.includes(pTam))
  })

  if (exactMatch && exactMatch.sku) {
    return exactMatch.sku
  }

  // 2. Busca por SPU + Cor (para acessórios sem variação de tamanho)
  const spuColorMatch = targetProducts.find(p => {
    const pSpu = p.spu.toUpperCase()
    const pCor = normalizeForMatch(p.color)
    return pSpu === normSpu && (pCor === normCor || pCor === 'unica' || pCor === 'u' || normCor === 'unica')
  })

  if (spuColorMatch && spuColorMatch.sku) {
    return spuColorMatch.sku
  }

  // 3. Fallback: qualquer item cadastrado com esse SPU
  const spuMatch = targetProducts.find(p => p.spu.toUpperCase() === normSpu)
  if (spuMatch && spuMatch.sku) {
    return spuMatch.sku
  }

  return spu
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
      const tam = (variationRow.sizeRaw || 'U').trim()

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
) => Promise<string[]>

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

  const allEntries = [...listingsMap.entries()]
  const kitEntries = allEntries.filter(([, rows]) => {
    const titleLower = (rows[0].title || '').toLowerCase()
    const isIgnored = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isIgnored) return false
    const hasKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlus = (rows[0].title || '').includes('+')
    return hasKeyword || hasPlus
  })

  const imageVisionCache = new Map<string, string[]>()
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

    // 1. Tentar identificar por Vision AI
    if (visionFn && imgUrl) {
      try {
        if (imageVisionCache.has(imgUrl)) {
          componentSPUs = [...imageVisionCache.get(imgUrl)!]
          visionUsed = true
          visionConfidence = 'cached'
        } else {
          const identified = await visionFn(imgUrl, targetProducts, rawTitle)
          imageVisionCache.set(imgUrl, identified)
          if (identified.length > 0) {
            componentSPUs = [...identified]
            visionUsed = true
            visionConfidence = identified.length >= 2 ? 'high' : 'medium'
          }
        }
      } catch (visionErr: any) {
        fallbackReason = `Vision error: ${visionErr.message}`
      }
    }

    // 2. CRICIAL: UNIFICAR com componentes extraídos do título (+)
    const titleComponents = extractKitComponents(rawTitle)
    const localErrors: ErrorLogItem[] = []

    for (const compName of titleComponents) {
      const found = findBestProductForComponent(compName, targetProducts, categoryRules)
      if (found) {
        const cleanSpu = sanitizeText(found.spu).toUpperCase().replace(/\s+/g, '-')
        if (!componentSPUs.includes(cleanSpu)) {
          componentSPUs.push(cleanSpu)
        }
      } else {
        // EXPLICITAMENTE APONTAR NA CENTRAL DE ERROS SE O COMPONENTE NÃO FOR LOCALIZADO NO SUPABASE!
        const unmappedItem: ErrorLogItem = {
          type: 'ERRO',
          clientRow: firstRow.rowIdx,
          productName: rawTitle,
          field: 'Componente Não Localizado no Supabase',
          originalValue: compName,
          correctedValue: '-',
          message: `Componente '${compName}' do anúncio (${listingId}) não foi encontrado no armazém Supabase. Identifique e cadastre o produto no armazém.`,
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        }
        globalErrorLogs.push(unmappedItem)
        localErrors.push(unmappedItem)
      }
    }

    if (!visionUsed) {
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

    const hasError = localErrors.some(e => e.type === 'ERRO')

    if (componentSPUs.length === 0 || hasError) {
      if (componentSPUs.length === 0 && !hasError) {
        const emptyError: ErrorLogItem = {
          type: 'AVISO', clientRow: firstRow.rowIdx, productName: rawTitle,
          field: 'Componentes do Kit', originalValue: imgUrl || rawTitle, correctedValue: '-',
          message: `Nenhum produto do kit foi encontrado no armazém Supabase. Cadastre os produtos no armazém.`,
          generatedFile: 'Kits', upSellerLineRange: '-'
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

    for (const variationRow of rows) {
      const cor = (variationRow.colorRaw || '').trim()
      const tam = (variationRow.sizeRaw || 'U').trim()

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

  return { kitsRows, allListings, errorLogs: globalErrorLogs, visionLogs }
}
