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
    if (component.length > 2) {
      components.push(component)
    }
  }

  return components
}

// 3. Score de similaridade entre dois textos (0 a 1)
function similarityScore(a: string, b: string): number {
  const normA = normalizeForMatch(a)
  const normB = normalizeForMatch(b)

  if (normA === normB) return 1.0
  if (normA.includes(normB) || normB.includes(normA)) return 0.85

  const wordsA = normA.split(/\s+/).filter(w => w.length >= 3)
  const wordsB = normB.split(/\s+/).filter(w => w.length >= 3)
  if (wordsA.length === 0 || wordsB.length === 0) return 0

  let matches = 0
  for (const wa of wordsA) {
    if (wordsB.some(wb => wb.includes(wa) || wa.includes(wb))) matches++
  }

  const recall = matches / wordsA.length
  const precision = matches / wordsB.length
  return (recall + precision) / 2
}

// 4. Encontrar melhor produto no armazém para um componente do kit
function findBestProductForComponent(
  componentName: string,
  warehouseProducts: WarehouseProductItem[]
): WarehouseProductItem | null {
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

  // Limiar mínimo de confiança
  return bestScore >= 0.3 ? bestProduct : null
}

// 5. Processar Anúncios do Marketplace conforme Prompt 2 (Kits & Regras de Negócio)
export function processMarketplaceListings(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string = '',
  kitKeywords: string[] = ['kit', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto']
): ParseMarketplaceResult {
  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []

  // Agrupar linhas por ID de anúncio (cada anúncio tem múltiplas linhas = variações)
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

    // Regra 1: Verificar se é "Conjunto" (termos de exceção → Pendentes)
    const isConjunto = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isConjunto) {
      const warningItem: ErrorLogItem = {
        type: 'AVISO',
        clientRow: firstRow.rowIdx,
        productName: rawTitle,
        field: 'Tipo Anúncio',
        originalValue: rawTitle,
        correctedValue: 'PENDENTE (Conjunto)',
        message: 'Anúncio do tipo "Conjunto" identificado. Mantido como Pendente sem alterar SKU.',
        generatedFile: 'Kits',
        upSellerLineRange: '-'
      }
      globalErrorLogs.push(warningItem)
      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'ignored_conjunto',
        detectedType: 'conjunto',
        generatedKitRows: [],
        errorLogs: [warningItem]
      })
      continue
    }

    // Regra 2: Verificar se é Kit (palavras-chave no título OU presença de "+" separando produtos)
    const hasKitKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlusSeparator = rawTitle.includes('+')
    const isKit = hasKitKeyword || hasPlusSeparator

    if (!isKit) {
      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'standardized',
        detectedType: 'simple',
        generatedKitRows: [],
        errorLogs: []
      })
      continue
    }

    // ── PROCESSAMENTO DE KIT ──
    // Extrair componentes pelo separador "+" no título
    const kitComponents = extractKitComponents(rawTitle)
    const componentSPUs: string[] = []
    const componentProducts: WarehouseProductItem[] = []
    const localErrors: ErrorLogItem[] = []

    for (const componentName of kitComponents) {
      const found = findBestProductForComponent(componentName, targetProducts)
      if (found) {
        const cleanSpu = sanitizeText(found.spu).toUpperCase().replace(/\s+/g, '-')
        // Evitar duplicidade de SPU no mesmo kit
        if (!componentSPUs.includes(cleanSpu)) {
          componentSPUs.push(cleanSpu)
          componentProducts.push(found)
        }
      } else {
        localErrors.push({
          type: 'AVISO',
          clientRow: firstRow.rowIdx,
          productName: rawTitle,
          field: 'Componente do Kit',
          originalValue: componentName,
          correctedValue: '-',
          message: `Componente "${componentName}" não encontrado no armazém Supabase. Verifique o cadastro de produtos.`,
          generatedFile: 'Kits',
          upSellerLineRange: '-'
        })
      }
    }

    if (componentSPUs.length === 0) {
      localErrors.forEach(e => globalErrorLogs.push(e))
      allListings.push({
        listingId,
        title: rawTitle,
        cleanTitle,
        statusMarketplace: firstRow.status || 'ativo',
        listingStatus: 'blocked_error',
        detectedType: 'kit',
        generatedKitRows: [],
        errorLogs: localErrors
      })
      continue
    }

    // Ordenar SPUs alfabeticamente para consistência no Kit SKU
    componentSPUs.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    const spuPart = componentSPUs.join('-')

    const imgUrl = firstRow.imageUrl || ''
    const itemKitRows: GeneratedKitRow[] = []

    // Gerar uma linha por variação (cor + tamanho) para cada componente do kit
    for (const variationRow of rows) {
      const cor = (variationRow.colorRaw || '').trim()
      const tam = (variationRow.sizeRaw || 'U').trim()

      const cleanCor = removeAccentsAndCedilla(cor)
        .replace(/ç/gi, 'c')
        .replace(/\s+/g, '')
        .toUpperCase() || 'UNICA'

      const cleanTam = removeAccentsAndCedilla(tam)
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toUpperCase() || 'U'

      // Formato final: KIT-{SPU1}-{SPU2}-...-{COR}-{TAM}
      let kitSku = `KIT-${spuPart}-${cleanCor}-${cleanTam}`.replace(/\s+/g, '')

      // Máximo de 50 caracteres
      if (kitSku.length > 50) {
        kitSku = kitSku.slice(0, 50)
      }

      // Uma linha por componente do kit por variação
      for (const compProduct of componentProducts) {
        const kitRow: GeneratedKitRow = {
          kitSku,
          title: cleanTitle,
          imageUrl: compProduct.image_url || imgUrl,
          sku: compProduct.sku,
          skuQty: 1
        }
        kitsRows.push(kitRow)
        itemKitRows.push(kitRow)
      }
    }

    localErrors.forEach(e => globalErrorLogs.push(e))

    allListings.push({
      listingId,
      title: rawTitle,
      cleanTitle,
      statusMarketplace: firstRow.status || 'ativo',
      listingStatus: 'standardized',
      detectedType: 'kit',
      kitSku: itemKitRows[0]?.kitSku,
      generatedKitRows: itemKitRows,
      errorLogs: localErrors
    })
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
) => Promise<string[]>  // Retorna array de SPUs identificados

// Resultado expandido com info de Vision por anúncio
export interface VisionProcessingLog {
  listingId: string
  title: string
  imageUrl: string
  visionSpus: string[]
  visionConfidence: string
  fallbackUsed: boolean
  fallbackReason?: string
}

// Processar anúncios com Vision AI como critério primário
// e fallback para matching por título como apoio
export async function processMarketplaceListingsWithVision(
  marketplaceRows: MarketplaceListingRow[],
  warehouseProducts: WarehouseProductItem[],
  targetSpu: string = '',
  kitKeywords: string[] = ['kit', 'pack', 'combo', 'jogo'],
  ignoreKeywords: string[] = ['conjunto'],
  visionFn?: VisionIdentifyFn,
  onProgress?: (current: number, total: number, listingId: string) => void
): Promise<ParseMarketplaceResult & { visionLogs: VisionProcessingLog[] }> {

  const kitsRows: GeneratedKitRow[] = []
  const allListings: ProcessedListingResult[] = []
  const globalErrorLogs: ErrorLogItem[] = []
  const visionLogs: VisionProcessingLog[] = []

  // Agrupar linhas por ID de anúncio
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

  // Filtrar apenas kits para chamar Vision (anúncios não-kit são tratados diretamente)
  const allEntries = [...listingsMap.entries()]
  const kitEntries = allEntries.filter(([, rows]) => {
    const titleLower = (rows[0].title || '').toLowerCase()
    const isIgnored = ignoreKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    if (isIgnored) return false
    const hasKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlus = (rows[0].title || '').includes('+')
    return hasKeyword || hasPlus
  })

  // Cache de imagem → SPUs para não chamar Vision duas vezes para a mesma foto
  const imageVisionCache = new Map<string, string[]>()
  let kitIdx = 0

  for (const [listingId, rows] of allEntries) {
    const firstRow = rows[0]
    const rawTitle = firstRow.title || ''
    const cleanTitle = rawTitle.replace(/\s+/g, ' ').trim()
    const titleLower = rawTitle.toLowerCase()

    // Regra 1: Conjunto → Pendente
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

    // Regra 2: Verificar se é Kit
    const hasKitKeyword = kitKeywords.some(kw => kw.trim() && titleLower.includes(kw.trim().toLowerCase()))
    const hasPlusSeparator = rawTitle.includes('+')
    const isKit = hasKitKeyword || hasPlusSeparator

    if (!isKit) {
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'simple', generatedKitRows: [], errorLogs: [] })
      continue
    }

    // ── KIT: IDENTIFICAÇÃO DOS COMPONENTES ──
    kitIdx++
    onProgress?.(kitIdx, kitEntries.length, listingId)

    const imgUrl = (firstRow.imageUrl || '').trim()
    let componentSPUs: string[] = []
    let visionUsed = false
    let fallbackUsed = false
    let fallbackReason = ''
    let visionConfidence = 'none'

    // CRITÉRIO 1 (PRIMÁRIO): Vision AI via foto
    if (visionFn && imgUrl) {
      try {
        // Usar cache se a mesma foto já foi analisada
        if (imageVisionCache.has(imgUrl)) {
          componentSPUs = imageVisionCache.get(imgUrl)!
          visionUsed = true
          visionConfidence = 'cached'
        } else {
          const identified = await visionFn(imgUrl, targetProducts, rawTitle)
          imageVisionCache.set(imgUrl, identified)
          if (identified.length > 0) {
            componentSPUs = identified
            visionUsed = true
            visionConfidence = identified.length >= 2 ? 'high' : 'medium'
          }
        }
      } catch (visionErr: any) {
        fallbackReason = `Vision error: ${visionErr.message}`
      }
    }

    // CRITÉRIO 2 (FALLBACK): Matching por título (separador "+")
    if (componentSPUs.length === 0) {
      fallbackUsed = true
      fallbackReason = fallbackReason || (!imgUrl ? 'Sem URL de imagem' : !visionFn ? 'Vision AI não configurada' : 'Vision retornou 0 resultados')

      const kitComponents = extractKitComponents(rawTitle)
      for (const compName of kitComponents) {
        const found = findBestProductForComponent(compName, targetProducts)
        if (found) {
          const cleanSpu = sanitizeText(found.spu).toUpperCase().replace(/\s+/g, '-')
          if (!componentSPUs.includes(cleanSpu)) componentSPUs.push(cleanSpu)
        }
      }
    }

    // Registrar log de Vision para diagnóstico
    visionLogs.push({
      listingId,
      title: rawTitle,
      imageUrl: imgUrl,
      visionSpus: visionUsed ? componentSPUs : [],
      visionConfidence,
      fallbackUsed,
      fallbackReason: fallbackUsed ? fallbackReason : undefined
    })

    if (componentSPUs.length === 0) {
      const localErrors: ErrorLogItem[] = [{
        type: 'AVISO', clientRow: firstRow.rowIdx, productName: rawTitle,
        field: 'Componentes do Kit', originalValue: imgUrl || rawTitle, correctedValue: '-',
        message: `Nenhum produto identificado pelo Vision AI nem pelo título. Cadastre os produtos no armazém Supabase.`,
        generatedFile: 'Kits', upSellerLineRange: '-'
      }]
      localErrors.forEach(e => globalErrorLogs.push(e))
      allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'blocked_error', detectedType: 'kit', generatedKitRows: [], errorLogs: localErrors })
      continue
    }

    // Mapear SPUs para produtos do armazém
    const componentProducts = componentSPUs
      .map(spu => targetProducts.find(p => sanitizeText(p.spu).toUpperCase().replace(/\s+/g, '-') === spu || p.spu.toUpperCase() === spu))
      .filter(Boolean) as WarehouseProductItem[]

    // Ordenar SPUs alfabeticamente para consistência no Kit SKU
    const sortedSpus = [...componentSPUs].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    const spuPart = sortedSpus.join('-')

    const itemKitRows: GeneratedKitRow[] = []

    for (const variationRow of rows) {
      const cor = (variationRow.colorRaw || '').trim()
      const tam = (variationRow.sizeRaw || 'U').trim()

      const cleanCor = removeAccentsAndCedilla(cor).replace(/ç/gi, 'c').replace(/\s+/g, '').toUpperCase() || 'UNICA'
      const cleanTam = removeAccentsAndCedilla(tam).replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() || 'U'

      let kitSku = `KIT-${spuPart}-${cleanCor}-${cleanTam}`.replace(/\s+/g, '')
      if (kitSku.length > 50) kitSku = kitSku.slice(0, 50)

      const imgForRow = variationRow.imageUrl || imgUrl

      // Uma linha por componente identificado
      const productsToUse = componentProducts.length > 0 ? componentProducts : [{ spu: spuPart, sku: spuPart, color: '', size: '', product_name: spuPart }]
      for (const compProduct of productsToUse) {
        const kitRow: GeneratedKitRow = { kitSku, title: cleanTitle, imageUrl: compProduct.image_url || imgForRow, sku: compProduct.sku, skuQty: 1 }
        kitsRows.push(kitRow)
        itemKitRows.push(kitRow)
      }
    }

    allListings.push({ listingId, title: rawTitle, cleanTitle, statusMarketplace: firstRow.status || 'ativo', listingStatus: 'standardized', detectedType: 'kit', kitSku: itemKitRows[0]?.kitSku, generatedKitRows: itemKitRows, errorLogs: [] })
  }

  return { kitsRows, allListings, errorLogs: globalErrorLogs, visionLogs }
}
