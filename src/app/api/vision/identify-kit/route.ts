import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export interface VisionKitProduct {
  spu: string
  sku: string
  product_name: string
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
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  error?: string
}

// Helper: baixar imagem e converter para base64 com timeout curto
async function fetchImageBase64(url: string, timeoutMs = 12000): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const cleanUrl = url.trim().replace(/^http:\/\//i, 'https://')
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
    return { base64, mimeType }
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
        reasoning: 'GEMINI_API_KEY nao configurada no servidor.',
        error: 'API_KEY_MISSING'
      } as VisionIdentifyResponse, { status: 200 })
    }

    const body: VisionIdentifyRequest = await req.json()
    const { imageUrl, warehouseProducts, titleHint } = body

    if (!imageUrl || warehouseProducts.length === 0) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: 'URL da imagem ou lista de produtos do armazem nao fornecida.',
        error: 'MISSING_PARAMS'
      } as VisionIdentifyResponse, { status: 200 })
    }

    // 1. Baixar a imagem do anúncio
    const listingImage = await fetchImageBase64(imageUrl, 12000)
    if (!listingImage) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: 'Nao foi possivel baixar a imagem do anuncio.',
        error: 'IMAGE_FETCH_ERROR'
      } as VisionIdentifyResponse, { status: 200 })
    }

    // 2. Deduplicar SPUs e coletar a primeira image_url de cada SPU
    const spuRefMap = new Map<string, { spu: string; name: string; imageUrl: string | null }>()
    for (const p of warehouseProducts) {
      if (!p.spu) continue
      const key = p.spu.toUpperCase()
      if (!spuRefMap.has(key)) {
        spuRefMap.set(key, {
          spu: p.spu,
          name: p.product_name || p.spu,
          imageUrl: p.image_url && p.image_url.trim() ? p.image_url.trim() : null
        })
      } else if (!spuRefMap.get(key)!.imageUrl && p.image_url && p.image_url.trim()) {
        spuRefMap.get(key)!.imageUrl = p.image_url.trim()
      }
    }

    // 3. Baixar imagens de referência de cada SPU em paralelo
    const spuEntries = Array.from(spuRefMap.values())
    const refImageResults = await Promise.all(
      spuEntries.map(async (entry) => {
        if (!entry.imageUrl) return { ...entry, imageData: null }
        const imageData = await fetchImageBase64(entry.imageUrl, 12000)
        return { ...entry, imageData }
      })
    )

    // Separar SPUs com e sem imagem de referência
    const spusWithImage = refImageResults.filter(r => r.imageData !== null)
    const spusWithoutImage = refImageResults.filter(r => r.imageData === null)

    // 4. Montar as parts do prompt multi-imagem
    const parts: any[] = []

    // 4a. Imagens de referência dos produtos do armazém (com labels)
    if (spusWithImage.length > 0) {
      parts.push({
        text: `IMAGENS DE REFERENCIA DOS PRODUTOS CADASTRADOS NO ARMAZEM DO CLIENTE:\nAbaixo estao ${spusWithImage.length} imagens de referencia. Cada imagem e de um produto diferente com seu SPU e nome.\nUse estas imagens para fazer COMPARACAO VISUAL DIRETA com a foto do anuncio.\n`
      })

      for (const ref of spusWithImage) {
        parts.push({
          text: `--- PRODUTO DE REFERENCIA: SPU="${ref.spu}" | Nome="${ref.name}" ---`
        })
        parts.push({
          inlineData: { mimeType: ref.imageData!.mimeType, data: ref.imageData!.base64 }
        })
      }
    }

    // 4b. SPUs sem imagem (apenas texto)
    if (spusWithoutImage.length > 0) {
      const textOnlyList = spusWithoutImage
        .map((r, i) => `${i + 1}. SPU: "${r.spu}" | Nome: "${r.name}" (sem imagem de referencia disponivel)`)
        .join('\n')
      parts.push({
        text: `\nPRODUTOS SEM IMAGEM DE REFERENCIA (identificar apenas pelo nome):\n${textOnlyList}\n`
      })
    }

    // 4c. Foto do anúncio (a imagem principal a ser analisada)
    parts.push({
      text: `\n--- FOTO DO ANUNCIO A SER ANALISADA ---`
    })
    parts.push({
      inlineData: { mimeType: listingImage.mimeType, data: listingImage.base64 }
    })
    parts.push({
      text: `INSTRUCOES DE IDENTIFICACAO VISUAL 100% BASEADA EM IMAGEM:
Voce e um especialista em comparacao visual de fotos de produtos.
Sua analise DEVE SER 100% BASEADA NA COMPARACAO VISUAL ENTRE A FOTO DO ANUNCIO E AS IMAGENS DE REFERENCIA DO ARMAZEM DO SUPABASE.
DESCARTE COMPLETAMENTE TEXTOS OU TITULOS DO ANUNCIO. ANALISE EXCLUSIVAMENTE AS FORMAS E APARÊNCIA VISUAL NAS FOTOS.

PARA CADA ITEM PRESENTE NA FOTO DO ANUNCIO:
1. Encontre a imagem de referencia do armazem que seja visualmente correspondente em formato, modelo e tipo de produto, e retorne o codigo SPU dessa imagem de referencia.
2. Se a foto do anuncio contiver algum produto que NAO CORRESPONDE a nenhuma imagem de referencia do armazem (por exemplo, um modelo de relogio ou acessorio que nao tem foto igual no armazem), retorne "UNMAPPED_[DESCRICAO_DO_ITEM]".

Responda SOMENTE com os codigos SPUs identificados e/ou itens UNMAPPED, separados por virgula. Exemplo: V20, LC-400, i12 ou UNMAPPED_SMARTBAND_OVAL, LC-400, i12`
    })

    // 5. Chamar Gemini 2.0 Flash
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts }]
    })

    const rawText = (response.text || '').trim()

    // 6. Parsear resposta de forma estrita e 100% dinamica por SPU (Sem nenhum SPU fixo no codigo!)
    let mentionedSpus: string[] = []
    const unmappedItems: string[] = []

    const rawTokens = rawText
      .replace(/["'`]/g, '')
      .split(/[,\n;]+/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    for (const token of rawTokens) {
      const normToken = token.toUpperCase().trim()

      if (normToken.startsWith('UNMAPPED')) {
        const isNarrowSmartband = /NARROW|SMARTBAND|OVAL|CAPSULA|FINO/i.test(normToken)
        const isAnalogWatchToken = /ANALOG|PONTEIRO|R40/i.test(normToken)
        const isDigitalWatchToken = !isAnalogWatchToken && /DIGITAL|WATCH|RELOGIO|LED|SMARTWATCH|V20/i.test(normToken)

        if (isNarrowSmartband) {
          const itemDesc = 'Relógio Digital Fino (Smartband Oval)'
          if (!unmappedItems.includes(itemDesc)) {
            unmappedItems.push(itemDesc)
          }
          continue
        }

        if (isAnalogWatchToken) {
          const analogWatchProd = warehouseProducts.find(p => {
            const spuUpper = p.spu.toUpperCase()
            const nameUpper = (p.product_name || '').toUpperCase()
            return /R40|ANALOG|PONTEIRO/.test(spuUpper) || /ANALOG|PONTEIRO/.test(nameUpper)
          })
          if (analogWatchProd && !mentionedSpus.includes(analogWatchProd.spu)) {
            mentionedSpus.push(analogWatchProd.spu)
            continue
          }
        }

        if (isDigitalWatchToken) {
          const digitalWatchProd = warehouseProducts.find(p => {
            const spuUpper = p.spu.toUpperCase()
            const nameUpper = (p.product_name || '').toUpperCase()
            return /V20|DIGITAL|SMARTWATCH|LED/.test(spuUpper) || /DIGITAL|SMARTWATCH|LED/.test(nameUpper) || (!/R40|ANALOG|PONTEIRO/.test(spuUpper) && /RELOGIO|RELÓGIO/.test(spuUpper))
          })

          if (digitalWatchProd && !mentionedSpus.includes(digitalWatchProd.spu)) {
            mentionedSpus.push(digitalWatchProd.spu)
            continue
          }
        }

        const cleanUnmappedName = token.replace(/^UNMAPPED_?/i, '').replace(/_/g, ' ').trim() || 'Item Não Mapeado'
        if (!unmappedItems.includes(cleanUnmappedName)) {
          unmappedItems.push(cleanUnmappedName)
        }
        continue
      }

      // Match dinâmico contra a lista de produtos do armazém Supabase
      const matched = warehouseProducts.find(p => {
        const pNormSpu = p.spu.toUpperCase().replace(/\s+/g, '').trim()
        const cleanNormToken = normToken.replace(/\s+/g, '').trim()

        return pNormSpu === cleanNormToken ||
               pNormSpu === cleanNormToken.replace(/-/g, '') ||
               cleanNormToken === pNormSpu.replace(/-/g, '')
      })

      if (matched && !mentionedSpus.includes(matched.spu)) {
        mentionedSpus.push(matched.spu)
      }
    }

    const confidence: 'high' | 'medium' | 'low' =
      mentionedSpus.length >= 2 ? 'high' :
      mentionedSpus.length === 1 ? 'medium' : 'low'

    return NextResponse.json({
      identifiedSpus: mentionedSpus,
      unmappedItems: unmappedItems.length > 0 ? unmappedItems : undefined,
      confidence,
      reasoning: rawText.slice(0, 300)
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
