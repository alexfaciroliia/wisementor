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
  clientVisionInstructions?: string
  ignoredProps?: string[]
  visionSensitivity?: string
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
    const { imageUrl, warehouseProducts, titleHint, clientVisionInstructions, ignoredProps, visionSensitivity } = body

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

    const customRules = clientVisionInstructions && clientVisionInstructions.trim()
      ? `\nDIRETRIZES VISUAIS ESPECÍFICAS DESTE CLIENTE:\n${clientVisionInstructions.trim()}\n`
      : ''

    const ignoredPropsList = Array.isArray(ignoredProps) && ignoredProps.length > 0
      ? ignoredProps.join(', ')
      : 'livros de apoio, caixas onde os produtos ficam apoiados, vasos de plantas, mesas, tapetes, fundos decorativos'

    parts.push({
      text: `REGRAS ESTRITAS DE COMPARAÇÃO VISUAL (ANTI-ALUCINAÇÃO):
1. COMPARAÇÃO RIGOROSA DE MODELO E DESIGN:
   - Compare cada item físico da foto do anúncio contra as fotos oficiais de referência do armazém.
   - NÃO associe um código SPU se o item na foto do anúncio tiver formato, costura, fivelas, texturas ou estrutura física diferente da foto de referência.
   - Qualquer produto na foto que não seja estruturalmente idêntico a um modelo de referência DEVE ser listado em "unmapped_items".
${customRules}
2. CORES E VARIAÇÕES: O produto pode estar em qualquer uma das cores oficiais de referência do mesmo SPU, desde que o modelo físico e design sejam idênticos.
3. ELEMENTOS DE CENÁRIO/DECORAÇÃO (IGNORAR): ${ignoredPropsList}. Estes itens são meramente decorativos e NÃO SÃO produtos de venda. NÃO os conte no total de itens e NÃO os adicione em unmapped_items.
4. CONTAGEM TOTAL DE PRODUTOS DE VENDA: Conte quantos produtos físicos reais de venda estão expostos na foto.
5. PRODUTOS NÃO CADASTRADOS (UNMAPPED): Apenas produtos reais de venda que não correspondam a nenhum modelo do armazém devem ser listados em "unmapped_items".
6. FORMATO DA RESPOSTA (JSON):
Responda EXCLUSIVAMENTE em formato JSON:
{
  "total_items_in_photo": <número total de produtos de venda visíveis na foto>,
  "matched_spus": ["<SPU1>", "<SPU2>"],
  "unmapped_items": ["<Descrição dos produtos de venda não cadastrados>"],
  "reasoning": "<Explicação objetiva dos detalhes visuais comparados>"
}`
    })

    // 5. Chamar Gemini 3.5 Flash Lite (temperatura 0 para 100% determinismo)
    const ai = new GoogleGenAI({ apiKey })
    let response: any = null
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [{ parts }],
        config: { temperature: 0 }
      })
    } catch (modelErr: any) {
      console.warn('[vision/identify-kit] Fallback para gemini-3.1-flash-lite devido a:', modelErr.message)
      try {
        await new Promise(resolve => setTimeout(resolve, 500))
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ parts }],
          config: { temperature: 0 }
        })
      } catch (retryErr: any) {
        console.warn('[vision/identify-kit] Fallback para gemini-3.5-flash devido a:', retryErr.message)
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ parts }],
          config: { temperature: 0 }
        })
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
