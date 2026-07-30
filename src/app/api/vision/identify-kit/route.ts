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
async function fetchImageBase64(url: string, timeoutMs = 8000): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WiseMentor/1.0)' },
      signal: AbortSignal.timeout(timeoutMs)
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
        const imageData = await fetchImageBase64(entry.imageUrl, 6000)
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

    // 4d. Contexto do título (apenas suporte secundário)
    const titleContext = titleHint
      ? `\nTITULO DO ANUNCIO (apenas suporte secundario): "${titleHint}"`
      : ''

    // 4e. Instruções do prompt (100% genérico, sem nenhum SPU hardcoded)
    parts.push({
      text: `${titleContext}

INSTRUCOES:
Voce e um especialista em identificacao visual de produtos. Sua tarefa e comparar a FOTO DO ANUNCIO com as IMAGENS DE REFERENCIA dos produtos do armazem.

1. Examine CADA item visualmente presente na foto do anuncio.
2. Para cada item, compare VISUALMENTE com as imagens de referencia fornecidas acima.
3. A COMPARACAO VISUAL E A AUTORIDADE FINAL. Considere:
   - Formato/silhueta do produto (quadrado vs oval vs redondo vs retangular)
   - Tipo de display (LED digital vs ponteiros fisicos vs sem display)
   - Material e textura visual (metal vs silicone vs couro)
   - Proporcoes (largo vs estreito, grosso vs fino)
4. Se um item da foto do anuncio corresponder visualmente a um produto de referencia, retorne o SPU desse produto.
5. Se um item da foto do anuncio NAO corresponder visualmente a NENHUM dos produtos de referencia (nem os com imagem nem os sem imagem), retorne "UNMAPPED_[descricao curta do item em ingles]".
   Exemplos: UNMAPPED_NARROW_DIGITAL_WATCH, UNMAPPED_LEATHER_WALLET, UNMAPPED_SUNGLASSES
6. NAO force correspondencias. Se o formato visual e diferente, e um item diferente mesmo que a categoria seja similar.

Responda SOMENTE com os SPUs identificados e/ou itens UNMAPPED, separados por virgula.
Exemplo de resposta: SPU1, SPU2, UNMAPPED_ITEM_NAME

RESPOSTA:`
    })

    // 5. Chamar Gemini 2.0 Flash
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts }]
    })

    const rawText = (response.text || '').trim()

    // 6. Parsear resposta — lógica simplificada sem regex hardcoded
    const mentionedSpus: string[] = []
    const unmappedItems: string[] = []

    const rawTokens = rawText
      .replace(/["'`]/g, '')
      .split(/[,\n;]+/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    for (const token of rawTokens) {
      const normToken = token.toUpperCase()

      // Detectar itens UNMAPPED
      if (normToken.startsWith('UNMAPPED')) {
        // Converter UNMAPPED_NARROW_DIGITAL_WATCH -> "Narrow Digital Watch"
        const description = token
          .replace(/^UNMAPPED[_-]?/i, '')
          .replace(/_/g, ' ')
          .trim()
        unmappedItems.push(description || 'Item Não Identificado')
        continue
      }

      // Tentar match direto com SPUs do armazém
      const matched = warehouseProducts.find(p => {
        const pNormSpu = p.spu.toUpperCase().replace(/\s+/g, ' ').trim()
        return pNormSpu === normToken ||
               pNormSpu === normToken.replace(/\s+/g, '-') ||
               normToken === pNormSpu.replace(/\s+/g, '-') ||
               pNormSpu.includes(normToken) ||
               normToken.includes(pNormSpu)
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
