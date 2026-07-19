/**
 * cv-engine.ts
 * Motor de Visão Computacional para Reconciliação Visual de Fotos
 * (Skeleton Estrutural para Desenvolvimento posterior)
 */

/**
 * Gera o visual/perceptual hash de uma imagem (pHash ou dHash)
 * Em produção, utiliza sharp e image-hash para calcular o fingerprint de 64-bits.
 */
export async function generatePerceptualHash(imageUrlOrBuffer: string | Buffer): Promise<string> {
  // Simulando geração de hash
  if (typeof imageUrlOrBuffer === 'string') {
    // Retorna um hash determinístico baseado na URL para fins de mock/testes estruturais
    let hash = 0;
    for (let i = 0; i < imageUrlOrBuffer.length; i++) {
      hash = (hash << 5) - hash + imageUrlOrBuffer.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
  
  // Se for buffer, gera um hash aleatório consistente
  return 'f8a4c2e6b0d9e7f1';
}

/**
 * Calcula a Distância de Hamming entre dois hashes hexadecimais
 * Retorna o número de posições diferentes (0 a 64 para hashes de 64 bits)
 */
export function calculateHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return 64;
  
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    // Converte os caracteres hexadecimais em inteiros de 4 bits (nibbles)
    const valA = parseInt(hashA[i], 16);
    const valB = parseInt(hashB[i], 16);
    
    // Efetua XOR para ver quais bits são diferentes
    let xor = valA ^ valB;
    
    // Conta os bits ativos (popcount)
    while (xor > 0) {
      if (xor & 1) distance++;
      xor >>= 1;
    }
  }
  
  return distance;
}

/**
 * Compara dois hashes e retorna a similaridade em porcentagem (0 a 100)
 */
export function compareVisualSimilarity(hashA: string, hashB: string): number {
  const distance = calculateHammingDistance(hashA, hashB);
  // Se a distância é 0, similaridade é 100%. Se for maior que 32, similaridade cai a zero
  const maxDistance = 32;
  const similarity = Math.max(0, 100 - (distance / maxDistance) * 100);
  return Math.round(similarity);
}

/**
 * Verifica similaridade de imagem direta por URL
 */
export async function compareImagesByUrl(urlA: string, urlB: string): Promise<{
  similarity: number;
  match: boolean;
}> {
  const hashA = await generatePerceptualHash(urlA);
  const hashB = await generatePerceptualHash(urlB);
  const similarity = compareVisualSimilarity(hashA, hashB);
  
  return {
    similarity,
    // Threshold padrão de aceitação para visual hash é distância <= 10 (aprox. 70% de similaridade)
    match: similarity >= 70
  };
}
