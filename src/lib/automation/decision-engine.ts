/**
 * decision-engine.ts
 * Motor de Regras de Negócio e Tomada de Decisão do WiseMentor
 * Contém a sanitização de SKUs, formatação de Kits e regras de validação.
 */

// 1. Sanitização de texto de SKU (remoção de acentos preservando espaços)
export function sanitizeSkuText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// 2. Geração do Kit SKU padronizado
export function buildKitSkuName(
  skuBase: string,
  qty: number,
  colors: string[],
  size: string
): string {
  const cleanSkuBase = sanitizeSkuText(skuBase);
  const cleanColors = colors.map(c => sanitizeSkuText(c)).join('_');
  const cleanSize = sanitizeSkuText(size);
  return `KIT${qty}-${cleanSkuBase}-${cleanColors}-${cleanSize}`;
}

export interface KitRow {
  kitSku: string;
  title: string;
  imageUrl: string;
  sku: string;
  qty: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// 3. Validação das 10 Regras Obrigatórias do Kit
export function validateKitData(rows: KitRow[]): ValidationResult {
  const errors: string[] = [];
  const accentRegex = /[áàâãéèêíïóôõúüçÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/;

  // Mapa para verificar consistência por Kit SKU
  // Estrutura: kitSku -> { title, imageUrl, expectedQty, components: Map<sku, qty> }
  const kitMap = new Map<string, {
    title: string;
    imageUrl: string;
    expectedQty: number;
    components: Map<string, number>;
    rawLines: string[];
  }>();

  // Para checar linhas duplicadas globais
  const seenLines = new Set<string>();

  rows.forEach((row, index) => {
    const lineNum = index + 1;

    // Regra 3: Coluna SKU presente e preenchida
    if (!row.sku || row.sku.trim() === '') {
      errors.push(`Linha ${lineNum}: O SKU individual é obrigatório e está ausente.`);
      return;
    }

    // Regra 6: Nenhum Kit SKU ou SKU contém acentos
    if (accentRegex.test(row.kitSku)) {
      errors.push(`Linha ${lineNum}: O Kit SKU "${row.kitSku}" contém acentos, o que é proibido.`);
    }
    if (accentRegex.test(row.sku)) {
      errors.push(`Linha ${lineNum}: O SKU individual "${row.sku}" contém acentos, o que é proibido.`);
    }

    // Regra 4: Cada SKU contém somente uma cor
    // A coluna SKU individual não deve conter delimitadores como _ ou / que unam cores
    if (row.sku.includes('_') || row.sku.includes('/')) {
      errors.push(`Linha ${lineNum}: O SKU individual "${row.sku}" contém mais de uma cor (delimitador inválido encontrado).`);
    }

    // Regra 10: Nenhuma linha está duplicada
    const lineKey = `${row.kitSku}|${row.title}|${row.imageUrl}|${row.sku}|${row.qty}`;
    if (seenLines.has(lineKey)) {
      errors.push(`Linha ${lineNum}: Linha duplicada detectada no arquivo.`);
    } else {
      seenLines.add(lineKey);
    }

    // Processamento e Agrupamento por Kit SKU para validações agregadas
    if (!kitMap.has(row.kitSku)) {
      // Extrair quantidade esperada do prefixo do Kit SKU (ex: KIT2-... -> 2)
      const qtyMatch = row.kitSku.match(/^KIT(\d+)-/i);
      const expectedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;

      if (expectedQty === 0) {
        errors.push(`Linha ${lineNum}: O Kit SKU "${row.kitSku}" não segue o formato correto com o prefixo "KIT(QUANTIDADE)-".`);
      }

      kitMap.set(row.kitSku, {
        title: row.title,
        imageUrl: row.imageUrl,
        expectedQty,
        components: new Map<string, number>(),
        rawLines: []
      });
    }

    const kitInfo = kitMap.get(row.kitSku)!;
    kitInfo.rawLines.push(lineKey);

    // Regra 9: Todas as linhas do mesmo Kit SKU utilizam o mesmo título e a mesma imagem
    if (kitInfo.title !== row.title) {
      errors.push(`Linha ${lineNum}: Título divergente para o mesmo Kit SKU "${row.kitSku}". Esperado: "${kitInfo.title}".`);
    }
    if (kitInfo.imageUrl !== row.imageUrl) {
      errors.push(`Linha ${lineNum}: URL da imagem divergente para o mesmo Kit SKU "${row.kitSku}". Esperado: "${kitInfo.imageUrl}".`);
    }

    // Regra 8: Cores repetidas dentro do mesmo kit foram consolidadas na coluna SKU Qnt.
    // Se o mesmo SKU já foi registrado para este kit, significa que não consolidaram.
    if (kitInfo.components.has(row.sku)) {
      errors.push(`Linha ${lineNum}: O SKU "${row.sku}" foi listado múltiplas vezes no kit "${row.kitSku}". Consolide as quantidades na coluna SKU Qnt.`);
    } else {
      kitInfo.components.set(row.sku, Number(row.qty));
    }
  });

  // Validações pós-agrupamento por Kit SKU
  kitMap.forEach((info, kitSku) => {
    // Regra 7: A soma de SKU Qnt. de cada Kit SKU é igual à quantidade declarada no kit
    let totalQty = 0;
    info.components.forEach(qty => {
      totalQty += qty;
    });

    if (totalQty !== info.expectedQty) {
      errors.push(`Kit "${kitSku}": A soma das quantidades de itens (${totalQty}) não bate com a quantidade especificada no Kit SKU (esperado: ${info.expectedQty}).`);
    }

    // Regra 5: As cores do kit estão separadas em linhas diferentes
    // O Kit SKU especifica as cores por underline. O número de cores no Kit SKU deve bater com o total de itens (em caso de cores diferentes)
    // Ex: KIT2-AN-SAIDA-CALCA FAIXA-Azul Bebe_Bege-M -> Cores: ["Azul Bebe", "Bege"] (2 cores distintas, logo 2 linhas)
    // Ex: KIT3-AN-CACHARREL-Preto_Preto_Branco-G -> Cores: ["Preto", "Preto", "Branco"] (2 cores distintas: Preto e Branco, logo 2 linhas)
    const parts = kitSku.split('-');
    if (parts.length >= 4) {
      const colorsSegment = parts[parts.length - 2];
      const expectedColors = colorsSegment.split('_').map(c => c.trim().toUpperCase());
      const distinctExpectedColors = new Set(expectedColors);

      // Extrair cores dos SKUs individuais fornecidos na planilha
      const providedColors = new Set<string>();
      info.components.forEach((_, sku) => {
        const skuParts = sku.split('-');
        if (skuParts.length >= 2) {
          const color = skuParts[skuParts.length - 2].trim().toUpperCase();
          providedColors.add(color);
        }
      });

      distinctExpectedColors.forEach(color => {
        if (!providedColors.has(color)) {
          errors.push(`Kit "${kitSku}": A cor "${color}" declarada no Kit SKU não foi encontrada em nenhuma das linhas de componentes.`);
        }
      });

      providedColors.forEach(color => {
        if (!distinctExpectedColors.has(color)) {
          errors.push(`Kit "${kitSku}": O componente de cor "${color}" listado não está presente na declaração de cores do Kit SKU.`);
        }
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Classifica um anúncio não mapeado como Simples ou Kit
 * (Mock inicial/Skeleton do decision engine para o pipeline)
 */
export async function classifyMarketplaceListing(
  title: string,
  imageHash: string,
  clientProducts: any[]
): Promise<{
  type: 'simple' | 'kit' | 'unknown';
  matchedSku?: string;
  confidence: number;
  components?: { sku: string; qty: number }[];
  reason?: string;
}> {
  const normalizedTitle = title.toLowerCase();
  
  // Detecção por palavras chave de Kit
  const isKitKeywords = normalizedTitle.includes('kit') || 
                        normalizedTitle.includes('combo') || 
                        normalizedTitle.includes('+') || 
                        normalizedTitle.includes('peças') || 
                        normalizedTitle.includes('pecas') || 
                        normalizedTitle.includes('unidades');

  if (isKitKeywords) {
    // Busca heurística básica nos produtos do cliente
    const matchedProducts: any[] = [];
    
    // Tenta achar produtos cujo Sku Padrão / Descrição esteja contida no título
    clientProducts.forEach(prod => {
      const cleanDesc = prod.description.toLowerCase();
      const cleanSku = prod.sku_upseller.toLowerCase();
      if (normalizedTitle.includes(cleanDesc) || normalizedTitle.includes(cleanSku)) {
        matchedProducts.push(prod);
      }
    });

    if (matchedProducts.length > 0) {
      // Cria a estrutura de componentes sugerida
      const components = matchedProducts.map(prod => ({
        sku: `${prod.sku_upseller}-${prod.color?.[0] || 'Unica'}-${prod.size?.[0] || 'U'}`,
        qty: 1
      }));

      // Extrai quantidade do título (ex: "Kit 2" ou "Leve 3")
      const qtyMatch = normalizedTitle.match(/(?:kit|leve|combo)\s*(\d+)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : components.length;

      return {
        type: 'kit',
        confidence: 0.8,
        components,
        reason: `Detectado Kit por palavras-chave com ${components.length} componentes encontrados.`
      };
    }

    return {
      type: 'kit',
      confidence: 0.5,
      reason: 'Possível Kit detectado pelo título, mas nenhum componente correspondente foi localizado na base.'
    };
  }

  // Mapeamento Simples - Busca similaridade visual ou textual exata
  const exactMatch = clientProducts.find(prod => 
    normalizedTitle.includes(prod.description.toLowerCase()) || 
    normalizedTitle.includes(prod.sku_upseller.toLowerCase())
  );

  if (exactMatch) {
    return {
      type: 'simple',
      matchedSku: exactMatch.sku_upseller,
      confidence: 0.95,
      reason: 'Produto simples identificado por correspondência textual direta.'
    };
  }

  return {
    type: 'unknown',
    confidence: 0.0,
    reason: 'Não foi possível classificar o anúncio de forma confiável.'
  };
}
