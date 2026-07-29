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
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  error?: string
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

    // Baixar a imagem e converter para base64
    let imageBase64: string
    let mimeType: string = 'image/jpeg'

    try {
      const imgRes = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WiseMentor/1.0)' },
        signal: AbortSignal.timeout(10000)
      })
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)

      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      mimeType = contentType.split(';')[0].trim()
      if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg'

      const arrayBuffer = await imgRes.arrayBuffer()
      imageBase64 = Buffer.from(arrayBuffer).toString('base64')
    } catch (fetchErr: any) {
      return NextResponse.json({
        identifiedSpus: [],
        confidence: 'low',
        reasoning: `Nao foi possivel baixar a imagem: ${fetchErr.message}`,
        error: 'IMAGE_FETCH_ERROR'
      } as VisionIdentifyResponse, { status: 200 })
    }

    // Montar lista de produtos para o prompt
    const productListText = warehouseProducts
      .map((p, i) => `${i + 1}. SPU:"${p.spu}" | Nome:"${p.product_name}"`)
      .join('\n')

    const titleContext = titleHint
      ? `\nDICA DO TITULO DO ANUNCIO: "${titleHint}" - use como apoio, mas confie principalmente na imagem.`
      : ''

    const prompt = `Voce e um especialista em identificacao visual de produtos (calcados, roupas, acessorios).

Analise a imagem fornecida. Esta e uma foto de um KIT composto de varios produtos diferentes vendidos juntos.

LISTA DE PRODUTOS DO ARMAZEM DO CLIENTE:
${productListText}
${titleContext}

TAREFA: Identifique quais produtos desta lista aparecem visivelmente na imagem do kit.

REGRAS:
1. Analise todos os itens visiveis na foto
2. Retorne os SPUs dos produtos que voce identificar
3. Nao invente SPUs que nao estao na lista acima
4. Inclua apenas produtos com mais de 50% de certeza
5. Responda SOMENTE com os SPUs identificados, separados por virgula. Exemplo: SPU-A, SPU-B, SPU-C

RESPOSTA:`

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt }
          ]
        }
      ]
    })

    const rawText = (response.text || '').trim()

    // Parsear SPUs reconhecidos da resposta
    const mentionedSpus: string[] = []
    const rawTokens = rawText
      .replace(/["'`]/g, '')
      .split(/[,\n;]+/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    for (const token of rawTokens) {
      const matched = warehouseProducts.find(p => {
        const normToken = token.toUpperCase().replace(/\s+/g, ' ')
        const normSpu = p.spu.toUpperCase().replace(/\s+/g, ' ')
        return normSpu === normToken ||
               normSpu.includes(normToken) ||
               normToken.includes(normSpu)
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
