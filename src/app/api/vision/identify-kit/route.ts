import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export interface VisionKitProduct {
  spu: string
  sku: string
  product_name: string
  color?: string
  image_url?: string
}

export interface VisionIdentifyRequest {
  imageUrl: string
  warehouseProducts: VisionKitProduct[]
  titleHint?: string
}

export interface VisionIdentifyResponse {
  identifiedSpus: string[]
  unmappedItems?: string[]
  totalItemsInPhoto?: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  error?: string
}

// Cache em memória global no servidor para evitar re-downloads repetidos do Supabase Storage
const globalImageCache = new Map<string, { base64: string; mimeType: string }>()

// Helper: baixar imagem e converter para base64 com cache e timeout
async function fetchImageBase64(url: string, timeoutMs = 12000): Promise<{ base64: string; mimeType: string } | null> {
  const cleanUrl = url.trim().replace(/^http:\/\//i, 'https://')
  if (globalImageCache.has(cleanUrl)) {
    return globalImageCache.get(cleanUrl)!
  }

  try {
    const res = await fetch(cleanUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow'
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    let mimeType = contentType.split(';')[0].trim()
    if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg'

    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const item = { base64, mimeType }
    globalImageCache.set(cleanUrl, item)
    return item
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: 'GEMINI_API_KEY não configurada no servidor.',
        error: 'API_KEY_MISSING'
      } as VisionIdentifyResponse, { status: 200 })
    }

    const body: VisionIdentifyRequest = await req.json()
    const { imageUrl, warehouseProducts, titleHint } = body

    if (!imageUrl || warehouseProducts.length === 0) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: 'URL da imagem ou lista de produtos do armazém não fornecida.',
        error: 'MISSING_PARAMS'
      } as VisionIdentifyResponse, { status: 200 })
    }

    // 1. Baixar a imagem do anúncio
    const listingImage = await fetchImageBase64(imageUrl, 12000)
    if (!listingImage) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: 'Não foi possível baixar a imagem do anúncio.',
        error: 'IMAGE_FETCH_ERROR'
      } as VisionIdentifyResponse, { status: 200 })
    }

    // 2. Coletar todas as imagens de referência distintas de cada SPU / Cor
    const refItemsMap = new Map<string, { spu: string; name: string; color?: string; imageUrl: string }>()
    const allSpusInWarehouse = new Set<string>()

    for (const p of warehouseProducts) {
      if (!p.spu) continue
      const spuKey = p.spu.toUpperCase()
      allSpusInWarehouse.add(spuKey)
      const imgUrl = (p.image_url || '').trim()
      const color = (p.color || '').trim()

      if (imgUrl) {
        const key = `${spuKey}_${imgUrl}`
        if (!refItemsMap.has(key)) {
          refItemsMap.set(key, {
            spu: p.spu,
            name: p.product_name || p.spu,
            color: color || undefined,
            imageUrl: imgUrl
          })
        }
      }
    }

    // 3. Baixar imagens de referência de cada variação em paralelo
    const refEntries = Array.from(refItemsMap.values())
    const refImageResults = await Promise.all(
      refEntries.map(async (entry) => {
        const imageData = await fetchImageBase64(entry.imageUrl, 12000)
        return { ...entry, imageData }
      })
    )

    // Separar SPUs com e sem imagem de referência
    const spusWithImage = refImageResults.filter(r => r.imageData !== null)
    const spusCovered = new Set(spusWithImage.map(r => r.spu.toUpperCase()))
    const spusWithoutImage = Array.from(allSpusInWarehouse).filter(spuKey => !spusCovered.has(spuKey))

    // 4. Montar as parts do prompt multi-imagem
    const parts: any[] = []

    // 4a. Imagens de referência dos produtos do armazém (com labels por SPU e Cor)
    if (spusWithImage.length > 0) {
      parts.push({
        text: `IMAGENS DE REFERÊNCIA DOS PRODUTOS CADASTRADOS NO ARMAZÉM DO SUPABASE:\nAbaixo estão ${spusWithImage.length} imagens de referência oficiais do armazém. Cada imagem possui seu código SPU, Nome e Cor correspondente.\nUse estas imagens para identificar visualmente quais produtos do armazém estão presentes na foto do anúncio.\nIMPORTANTE: Diferentes cores do mesmo modelo compartilham o mesmo código SPU (ex: Tênis SPU "LC-400" nas cores Cinza, Azul Marinho, Branco, Preto pertence ao SPU "LC-400").\n`
      })

      for (const ref of spusWithImage) {
        parts.push({
          text: `--- PRODUTO DO ARMAZÉM: SPU="${ref.spu}" | Nome="${ref.name}"${ref.color ? ` | Cor="${ref.color}"` : ''} ---`
        })
        parts.push({
          inlineData: { mimeType: ref.imageData!.mimeType, data: ref.imageData!.base64 }
        })
      }
    }

    // 4b. SPUs sem imagem (apenas texto de apoio)
    if (spusWithoutImage.length > 0) {
      const textOnlyList = spusWithoutImage
        .map((spuKey, i) => {
          const sampleProd = warehouseProducts.find(p => p.spu?.toUpperCase() === spuKey)
          return `${i + 1}. SPU: "${sampleProd?.spu || spuKey}" | Nome: "${sampleProd?.product_name || spuKey}" (sem imagem cadastrada)`
        })
        .join('\n')
      parts.push({
        text: `\nPRODUTOS SEM IMAGEM DE REFERÊNCIA NO ARMAZÉM:\n${textOnlyList}\n`
      })
    }

    // 4c. Foto do anúncio
    parts.push({
      text: `\n--- FOTO DO ANÚNCIO DE MARKETPLACE A SER ANALISADA ---`
    })
    parts.push({
      inlineData: { mimeType: listingImage.mimeType, data: listingImage.base64 }
    })

    parts.push({
      text: `REGRAS ESTRITAS DE COMPARAÇÃO VISUAL (DESIGN E MODELO EXATOS):
1. COMPARAÇÃO RIGOROSA DE MODELO E DESIGN:
   - Você DEVE examinar minuciosamente detalhes como: formato do bico, costuras, frisos, fivelas metálicas, fechos, cadarços, solado, botões e texturas.
   - NÃO associe um SPU se o produto na foto do anúncio for de um modelo ou formato diferente da foto de referência do armazém.
   - Exemplo de Sapato Social: A foto de referência do SPU "FN-6012" possui uma FIVELA METÁLICA RETANGULAR no peito do pé e FRISOS/COSTURAS HORIZONTAIS marcadas. Se o sapato do anúncio for liso, sem fivela ou com outro design de costura, ELE NÃO É O FN-6012! Você DEVE classificá-lo como "UNMAPPED_Sapato Social Liso" e NÃO associar o FN-6012.
   - Exemplo de Relógio: Se a foto mostra um relógio com display quadrado, ele corresponde ao "V20" (Quadrado); se tem display fino/alongado, corresponde ao "V5" (Slim); se for analógico com ponteiros, corresponde ao "V30" (Analógico). Não troque modelos.
2. CORES: O produto pode estar em qualquer uma das cores de referência do mesmo SPU (ex: Tênis LC-400 cinza ou azul marinho), DESDE QUE o design, formato e costura sejam IDÊNTICOS ao modelo de referência.
3. CONTAGEM TOTAL DE ITENS: Conte quantos produtos físicos distintos estão expostos na foto do anúncio.
4. PRODUTOS NÃO CADASTRADOS (UNMAPPED): Qualquer produto na foto que não seja IDÊNTICO em modelo/design a um dos produtos de referência do armazém DEVE ser retornado em "unmapped_items".
5. FORMATO DA RESPOSTA (JSON):
Responda EXCLUSIVAMENTE em formato JSON:
{
  "total_items_in_photo": <número total de itens físicos visíveis na foto>,
  "matched_spus": ["<SPU1>", "<SPU2>"],
  "unmapped_items": ["<Descrição dos itens na foto que não correspondem a nenhum modelo do armazém>"],
  "reasoning": "<Explicação objetiva dos detalhes visuais comparados>"
}`
    })

    // 5. Chamar Gemini Flash Latest (com retry para resiliência)
    const ai = new GoogleGenAI({ apiKey })
    let response: any = null
    try {
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [{ parts }]
      })
    } catch (modelErr: any) {
      console.warn('[vision/identify-kit] Retry com gemini-3.5-flash devido a:', modelErr.message)
      try {
        await new Promise(resolve => setTimeout(resolve, 800))
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ parts }]
        })
      } catch (retryErr: any) {
        console.error('[vision/identify-kit] Erro após retry:', retryErr.message)
        throw retryErr
      }
    }

    const rawText = (response.text || '').trim()

    // 6. Parsear JSON com fallback
    let matchedSpus: string[] = []
    let unmappedItems: string[] = []
    let totalItemsInPhoto = 0
    let reasoning = ''

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        totalItemsInPhoto = Number(parsed.total_items_in_photo) || 0
        if (Array.isArray(parsed.matched_spus)) {
          matchedSpus = parsed.matched_spus.map((s: any) => String(s).trim()).filter(Boolean)
        }
        if (Array.isArray(parsed.unmapped_items)) {
          unmappedItems = parsed.unmapped_items.map((u: any) => String(u).trim()).filter(Boolean)
        }
        reasoning = parsed.reasoning || ''
      }
    } catch {
      // Fallback por regex caso o modelo retorne texto simples
      const rawTokens = rawText
        .replace(/["'`{}]/g, '')
        .split(/[,\n;]+/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0)

      for (const token of rawTokens) {
        if (token.toUpperCase().startsWith('UNMAPPED')) {
          const cleanDesc = token.replace(/^UNMAPPED_?/i, '').replace(/_/g, ' ').trim()
          if (cleanDesc && !unmappedItems.includes(cleanDesc)) unmappedItems.push(cleanDesc)
        } else {
          const matched = warehouseProducts.find(p => {
            const pNorm = p.spu.toUpperCase().replace(/[\s-_]/g, '')
            const tNorm = token.toUpperCase().replace(/[\s-_]/g, '')
            return pNorm === tNorm
          })
          if (matched && !matchedSpus.includes(matched.spu)) {
            matchedSpus.push(matched.spu)
          }
        }
      }
      totalItemsInPhoto = matchedSpus.length + unmappedItems.length
    }

    // Validar se todos os matchedSpus existem no armazém
    const validMatchedSpus: string[] = []
    for (const spuCandidate of matchedSpus) {
      const found = warehouseProducts.find(p => {
        const pNorm = p.spu.toUpperCase().replace(/[\s-_]/g, '')
        const cNorm = spuCandidate.toUpperCase().replace(/[\s-_]/g, '')
        return pNorm === cNorm
      })
      if (found && !validMatchedSpus.includes(found.spu)) {
        validMatchedSpus.push(found.spu)
      } else if (!found) {
        if (!unmappedItems.includes(spuCandidate)) {
          unmappedItems.push(spuCandidate)
        }
      }
    }

    if (totalItemsInPhoto === 0) {
      totalItemsInPhoto = validMatchedSpus.length + unmappedItems.length
    }

    const confidence: 'high' | 'medium' | 'low' =
      validMatchedSpus.length >= 2 && unmappedItems.length === 0 ? 'high' :
      validMatchedSpus.length >= 1 ? 'medium' : 'low'

    return NextResponse.json({
      identifiedSpus: validMatchedSpus,
      unmappedItems: unmappedItems.length > 0 ? unmappedItems : undefined,
      totalItemsInPhoto,
      confidence,
      reasoning: reasoning || rawText.slice(0, 200)
    } as VisionIdentifyResponse)

  } catch (err: any) {
    console.error('[vision/identify-kit] Error:', err)
    return NextResponse.json({
      identifiedSpus: [],
      confidence: 'low',
      reasoning: `Erro interno: ${err.message}`,
      error: 'INTERNAL_ERROR'
    } as VisionIdentifyResponse, { status: 200 })
  }
}
