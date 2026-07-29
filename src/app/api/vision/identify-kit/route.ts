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
        signal: AbortSignal.timeout(12000)
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

    // Montar lista de produtos para o prompt (com SPUs únicos)
    const spuMap = new Map<string, string>()
    warehouseProducts.forEach(p => {
      if (p.spu && !spuMap.has(p.spu.toUpperCase())) {
        spuMap.set(p.spu.toUpperCase(), p.product_name || p.spu)
      }
    })

    const productListText = Array.from(spuMap.entries())
      .map(([spu, name], i) => `${i + 1}. SPU: "${spu}" | Nome/Categoria: "${name}"`)
      .join('\n')

    const titleContext = titleHint
      ? `\nTITULO COMPLETO DO ANUNCIO: "${titleHint}" - Use como apoio crucial para entender quais itens compoem o kit!`
      : ''

    const prompt = `Voce e um especialista em identificacao visual detalhada de produtos de moda (calcados, cintos, carteiras, relogios, fones de ouvido, meias e acessorios).

Analise ATENTAMENTE a imagem fornecida. Esta e uma foto de um KIT/COMBO que contem MULTIPLOS produtos vendidos juntos em um unico anuncio.

LISTA DE PRODUTOS/SPUs DO ARMAZEM DO CLIENTE:
${productListText}
${titleContext}

INSTRUCOES CRUCIAIS:
1. Examine TODA a imagem em busca de CADA um dos itens presentes (exemplo: sapato/tenis principal, cinto na parte superior, relogio digital/analogico ao lado, carteira de couro no canto inferior, fones de ouvido, etc).
2. ATENCAO CRUCIAL PARA RELOGIOS: Diferencie Relogio Digital (display LED quadrado com numeros digitais, pulseira de silicone, SPU V20) de Relogio Analogico (mostrador redondo tradicional com ponteiros e numeros). Se a imagem contiver um Relogio Analogico e a lista do armazem NAO tiver um SPU especifico para relogio analogico, NAO retorne V20!
3. Para CADA item visivel na imagem, encontre o SPU correspondente na lista de produtos do armazem acima.
4. NAO omita nenhum acessorio! Se houver um relogio digital, identifique o SPU do relogio digital (V20). Se houver cinto, identifique o SPU do cinto. Se houver carteira, identifique o SPU da carteira. Se houver sapato/tenis, identifique o SPU do sapato/tenis.
5. Responda SOMENTE com os SPUs identificados, separados por virgula. Exemplo: CART, V10, V20, FN-6012

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
        const normName = (p.product_name || '').toUpperCase().replace(/\s+/g, ' ')
        return normSpu === normToken ||
               normSpu.includes(normToken) ||
               normToken.includes(normSpu) ||
               (normName && normName.includes(normToken))
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

