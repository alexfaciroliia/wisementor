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
  totalItemsInPhoto?: number
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
        reasoning: 'GEMINI_API_KEY não configurada no servidor.',
        error: 'API_KEY_MISSING'
      } as VisionIdentifyResponse, { status: 200 })
    }

    const body: VisionIdentifyRequest = await req.json()
    const { imageUrl, warehouseProducts } = body

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
        text: `IMAGENS DE REFERÊNCIA DOS PRODUTOS CADASTRADOS NO ARMAZÉM DO SUPABASE:\nAbaixo estão ${spusWithImage.length} imagens de referência oficiais do armazém. Cada imagem possui seu código SPU e Nome correspondente.\nUse estas imagens para fazer COMPARAÇÃO VISUAL DIRETA E ESTRITA com a foto do anúncio.\n`
      })

      for (const ref of spusWithImage) {
        parts.push({
          text: `--- PRODUTO DO ARMAZÉM: SPU="${ref.spu}" | Nome="${ref.name}" ---`
        })
        parts.push({
          inlineData: { mimeType: ref.imageData!.mimeType, data: ref.imageData!.base64 }
        })
      }
    }

    // 4b. SPUs sem imagem (apenas texto de apoio)
    if (spusWithoutImage.length > 0) {
      const textOnlyList = spusWithoutImage
        .map((r, i) => `${i + 1}. SPU: "${r.spu}" | Nome: "${r.name}" (sem imagem cadastrada)`)
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
      text: `REGRAS ESTRITAS DE COMPARAÇÃO VISUAL:
1. REGRA MANDATÓRIA: O sistema NÃO pode identificar produtos por mera semelhança ou categoria genérica. Você DEVE IDENTIFICAR APENAS produtos que sejam ESTRITAMENTE IDÊNTICOS (mesmo modelo, mesmo formato, mesmo design visual) entre a foto do anúncio e as fotos de referência do armazém.
2. CONTAGEM DE ITENS: Conte quantos produtos físicos distintos estão expostos na foto do anúncio (ex: se a foto mostra 1 sapato + 1 relógio + 1 cinto + 1 carteira, são 4 itens).
3. ITENS NÃO IDÊNTICOS OU AUSENTES: Se um item na foto do anúncio for de um modelo diferente, não possuir referência idêntica no armazém ou for desconhecido, retorne como "UNMAPPED_[DESCRIÇÃO]".
4. FORMATO DA RESPOSTA (JSON):
Responda EXCLUSIVAMENTE em formato JSON com a seguinte estrutura:
{
  "total_items_in_photo": <número total de itens físicos visíveis na foto>,
  "matched_spus": ["<SPU1>", "<SPU2>"],
  "unmapped_items": ["<Descrição de item que não é idêntico a nenhum produto do armazém>"],
  "reasoning": "<Breve explicação da correspondência visual idêntica>"
}`
    })

    // 5. Chamar Gemini 2.0 Flash
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts }]
    })

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
