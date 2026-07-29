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

Analise PRIMEIRO E COM PRIORIDADE MAXIMA A IMAGEM FORNECIDA. A IMAGEM E A AUTORIDADE FINAL DA DECISAO.
Analise a forma visual, o formato, o tipo de display, as cores e as caracteristicas fisicas de CADA produto contido na foto.

LISTA DE PRODUTOS/SPUs DO ARMAZEM DO CLIENTE:
${productListText}
${titleContext}

INSTRUCOES CRUCIAIS DE IDENTIFICACAO VISUAL:
1. Examine a IMAGEM em busca de CADA um dos itens visualmente presentes (exemplo: modelo/formato de sapato/tenis, tipo de cinto, modelo de fone, relogio digital vs analogico, carteira).
2. PRIORIDADE DA IMAGEM: A foto visual sobressai sobre o titulo. O titulo serve APENAS como apoio secundario.
3. ATENCAO ABSOLUTA PARA RELOGIOS E ACESSORIOS:
   - Se a foto mostrar um Relogio Digital (tela LED preta, numeros digitais, pulseira de silicone/smartband) e o armazem SO TIVER Relogio Analogico (ex: R40 / RELOGIO ANALOGICO com ponteiros), NAO RETORNE R40! Escreva "UNMAPPED_DIGITAL_WATCH".
   - Se a foto mostrar qualquer item que NAO tem correspondente no armazem pelo formato/tipo, escreva "UNMAPPED_[NOME_DO_ITEM]".
4. Para cada produto da foto que possuir um correspondente no armazem, inclua o SPU da lista do armazem.
5. Responda SOMENTE com os SPUs identificados da lista do armazem ou itens UNMAPPED, separados por virgula. Exemplo de formato: SPU1, SPU2

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
    const unmappedItems: string[] = []

    const rawTokens = rawText
      .replace(/["'`]/g, '')
      .split(/[,\n;]+/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    for (const token of rawTokens) {
      const normToken = token.toUpperCase()
      if (normToken.includes('UNMAPPED') || normToken.includes('DIGITAL_WATCH') || normToken.includes('RELOGIO_DIGITAL')) {
        unmappedItems.push('Relógio Digital')
        continue
      }
      if (normToken.includes('ANALOG_WATCH') || normToken.includes('RELOGIO_ANALOGICO')) {
        unmappedItems.push('Relógio Analógico')
        continue
      }

      const matched = warehouseProducts.find(p => {
        const pNormSpu = p.spu.toUpperCase().replace(/\s+/g, ' ')
        const pNormName = (p.product_name || '').toUpperCase().replace(/\s+/g, ' ')
        
        // Bloquear conflito entre Digital e Analógico
        const tokenIsDigital = /DIGITAL|SMARTBAND|LED/.test(normToken)
        const tokenIsAnalog = /ANALOGIC|ANALÓGIC|PONTEIRO/.test(normToken)
        const prodIsDigital = /DIGITAL|SMARTBAND|LED/.test(pNormName) || /DIGITAL|SMARTBAND|LED/.test(pNormSpu)
        const prodIsAnalog = /ANALOGIC|ANALÓGIC|PONTEIRO/.test(pNormName) || /ANALOGIC|ANALÓGIC|PONTEIRO/.test(pNormSpu)

        if ((tokenIsDigital && prodIsAnalog) || (tokenIsAnalog && prodIsDigital)) {
          return false
        }

        return pNormSpu === normToken ||
               pNormSpu === normToken.replace(/\s+/g, '-') ||
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

