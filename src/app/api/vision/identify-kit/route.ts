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

    // 4d. Instruções do prompt (100% BASEADO NA IMAGEM DO ANUNCIO vs IMAGENS DE REFERENCIA)
    parts.push({
      text: `INSTRUCOES CRUCIAIS DE IDENTIFICACAO VISUAL 100% BASEADA EM IMAGEM:
Voce e um especialista em comparacao visual de fotos de produtos.
Sua analise DEVE SER 100% BASEADA NA COMPARACAO VISUAL ENTRE A FOTO DO ANUNCIO E AS IMAGENS DE REFERENCIA DO ARMAZEM DO SUPABASE.
DESCARTE COMPLETAMENTE TEXTOS OU TITULOS DO ANUNCIO. ANALISE EXCLUSIVAMENTE AS FORMAS E APERENCIA VISUAL NAS FOTOS.

REGRAS RIGIDAS DE IDENTIFICACAO VISUAL DE RELOGIOS:
No armazem do cliente:
1. SPU "V20": Relogio Digital Quadrado com tela LED ampla (estilo smartwatch quadrado).
2. SPU "R40": Relogio Analogico de Ponteiros (caixa redonda com ponteiros mecanicos fisicos de hora e minuto).

EXAMINE O RELOGIO DA FOTO COM MAXIMA PRECISAO VISUAL:

1. RELOGIO DIGITAL FINO / SMARTBAND OVAL (Visor LED estreito e oval na vertical, capsula fina com pulseira de silicone estreita):
   - ATENCAO CRUCIAL: Este relogio digital fino/smartband oval NAO ESTA CADASTRADO NO ARMAZEM DO SUPABASE!
   - Se a foto do anuncio mostrar este relogio digital fino/smartband oval, VOCE DEVE OBRIGATORIAMENTE RETORNAR "UNMAPPED_NARROW_DIGITAL_WATCH".
   - E ABSOLUTAMENTE PROIBIDO RETORNAR R40 (analogico) NEM V20 (quadrado) PARA O RELOGIO DIGITAL FINO!

2. RELOGIO DIGITAL QUADRADO (Display LED amplo quadrado/retangular, caixa ampla estilo smartwatch):
   - Se a foto do anuncio mostrar esse relogio digital quadrado com visor de LED igual/semelhante a imagem de referencia do SPU "V20": O SPU correto e "V20".
   - Retorne "V20".
   - E ABSOLUTAMENTE PROIBIDO RETORNAR R40 (analogico) PARA ESTE RELOGIO!

3. RELOGIO ANALOGICO DE PONTEIROS (Caixa redonda tradicional, mostrador fisico com PONTEIROS MECANICOS):
   - O SPU correto no armazem e "R40".
   - Retorne "R40" APENAS E SOMENTE se o relogio da foto tiver PONTEIROS MECANICOS FISICOS.

REGRAS GERAIS DE COMPARACAO:
- Se um item da foto do anuncio corresponder visualmente a uma imagem de referencia do armazem, retorne o SPU correspondente.
- Se algum item da foto NAO corresponder a nenhuma imagem de referencia do armazem, retorne "UNMAPPED_[NOME_DO_ITEM]".

Responda SOMENTE com os codigos SPUs identificados e/ou itens UNMAPPED, separados por virgula. Exemplo: V20, LC-400, i12 ou UNMAPPED_NARROW_DIGITAL_WATCH, LC-400, i12

RESPOSTA:`
    })

    // 5. Chamar Gemini 2.0 Flash
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts }]
    })

    const rawText = (response.text || '').trim()

    // 6. Parsear resposta de forma estrita por SPU
    let mentionedSpus: string[] = []
    const unmappedItems: string[] = []

    const rawTokens = rawText
      .replace(/["'`]/g, '')
      .split(/[,\n;]+/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    for (const token of rawTokens) {
      const normToken = token.toUpperCase().trim()

      // 1. Apenas relógio digital fino / smartband oval estreito não cadastrado é considerado UNMAPPED
      const isNarrowSmartband = normToken.includes('NARROW') || normToken.includes('SMARTBAND') || normToken.includes('OVAL') || normToken.includes('CAPSULA')
      
      if (normToken.includes('UNMAPPED') && isNarrowSmartband) {
        const itemDesc = 'Relógio Digital Fino (Smartband Oval)'
        if (!unmappedItems.includes(itemDesc)) {
          unmappedItems.push(itemDesc)
        }
        continue
      }

      // 2. Se a IA retornar SPU ou termo indicando relógio digital/smartwatch e o armazém tiver V20, associar ao SPU V20
      const hasV20InWarehouse = warehouseProducts.some(p => p.spu.toUpperCase() === 'V20')
      if ((normToken === 'V20' || normToken.includes('DIGITAL') || normToken.includes('LED') || normToken.includes('SMARTWATCH')) && hasV20InWarehouse) {
        if (!mentionedSpus.includes('V20')) {
          mentionedSpus.push('V20')
        }
        continue
      }

      // 3. Match ESTRITO por código SPU cadastrado no armazém
      const matched = warehouseProducts.find(p => {
        const pNormSpu = p.spu.toUpperCase().replace(/\s+/g, '').trim()
        const cleanNormToken = normToken.replace(/\s+/g, '').trim()

        // Evitar trocar Digital por Analógico e vice-versa
        const tokenIsDigital = /V20|DIGITAL|SMARTBAND|LED/.test(cleanNormToken)
        const tokenIsAnalog = /R40|ANALOGIC|ANALÓGIC|PONTEIRO/.test(cleanNormToken)
        const prodIsDigital = /V20|DIGITAL|SMARTBAND|LED/.test(pNormSpu) || /V20|DIGITAL|SMARTBAND|LED/.test((p.product_name || '').toUpperCase())
        const prodIsAnalog = /R40|ANALOGIC|ANALÓGIC|PONTEIRO/.test(pNormSpu) || /R40|ANALOGIC|ANALÓGIC|PONTEIRO/.test((p.product_name || '').toUpperCase())

        if ((tokenIsDigital && prodIsAnalog) || (tokenIsAnalog && prodIsDigital)) {
          return false
        }

        return pNormSpu === cleanNormToken ||
               pNormSpu === cleanNormToken.replace(/-/g, '') ||
               cleanNormToken === pNormSpu.replace(/-/g, '')
      })

      if (matched && !mentionedSpus.includes(matched.spu)) {
        mentionedSpus.push(matched.spu)
      }
    }

    // TRAVA DE SEGURANÇA SUPREMA:
    // Se a Visão AI detectou um relógio digital não cadastrado (unmappedItems possui relógio digital),
    // REMOVER R40 (analógico) se porventura a IA tiver incluído R40 por engano.
    const hasUnmappedDigitalWatch = unmappedItems.some(u => /digital|smartband/i.test(u))
    if (hasUnmappedDigitalWatch) {
      mentionedSpus = mentionedSpus.filter(spu => spu.toUpperCase() !== 'R40')
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
