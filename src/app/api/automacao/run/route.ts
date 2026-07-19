import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpSellerDriver } from '@/lib/automation/upseller-driver';
import { DbSyncManager } from '@/lib/automation/db-sync';
import { classifyMarketplaceListing, buildKitSkuName } from '@/lib/automation/decision-engine';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório.' }, { status: 400 });
    }

    // Criar logs em tempo real
    const logs: string[] = [];
    const pushLog = (msg: string) => {
      const timestamp = new Date().toLocaleTimeString();
      logs.push(`[${timestamp}] ${msg}`);
    };

    pushLog('Iniciando motor de automação (RPA)...');

    const sync = new DbSyncManager(supabase);
    
    // Obter produtos da base de dados do cliente (para o motor de decisão)
    pushLog('Buscando base de produtos (Fonte da Verdade) do banco...');
    let products = await sync.getProducts(clientId);
    if (products.length === 0) {
      pushLog('Aviso: Base de dados de produtos do banco vazia. Utilizando base simulada padrão.');
      // Fallback para mock local
      products = [
        { supplier: 'AN', sku_upseller: 'AN-SAIDA-CALCA FAIXA', description: 'Calça Feminina Saída De Praia Fita', color: ['Azul Bebe', 'Bege'], size: ['M'] },
        { supplier: 'AN', sku_upseller: 'AN-CACHARREL', description: 'Blusa Cacharrel Feminina Trico', color: ['Preto', 'Branco'], size: ['G'] },
        { supplier: 'GI', sku_upseller: 'REVERSE', description: 'Macacão Biquíni Reverse', color: ['Preto'], size: ['M'] },
        { supplier: 'GI', sku_upseller: 'MULA MANCA', description: 'Vestido Feminino Mula Manca', color: ['Preto'], size: ['P'] }
      ];
    } else {
      pushLog(`Base de produtos carregada: ${products.length} itens encontrados.`);
    }

    // Inicializa o Driver RPA
    const driver = new UpSellerDriver(clientId, (msg) => {
      pushLog(msg);
    });

    // Passo 1: Login
    const loginSuccess = await driver.login();
    if (!loginSuccess) {
      pushLog('Erro crítico: Falha ao se autenticar no UpSeller.');
      return NextResponse.json({ error: 'Falha de Login no UpSeller.', logs });
    }

    // Passo 2: Extrair Anúncios
    const unmappedListings = await driver.fetchUnmappedListings();
    if (unmappedListings.length === 0) {
      pushLog('Nenhum anúncio não mapeado foi identificado no UpSeller. Finalizando.');
      return NextResponse.json({ success: true, message: 'Nenhum anúncio pendente.', logs });
    }

    // Registrar sessão no Supabase (se possível)
    const sessionId = await sync.createSession(clientId).catch(() => null);

    let scrapedCount = unmappedListings.length;
    let mappedCount = 0;
    let kitsCreatedCount = 0;
    let reviewRequiredCount = 0;

    // Loop de decisão e execução
    for (const listing of unmappedListings) {
      pushLog(`----------------------------------------`);
      pushLog(`Analisando Anúncio: ID: ${listing.marketplace_listing_id} | Título: "${listing.title}"`);
      
      // Classificação Simples vs Kit
      const decision = await classifyMarketplaceListing(listing.title, '', products);
      
      if (decision.type === 'simple' && decision.matchedSku) {
        pushLog(`Classificado como: Simples (Confiança: ${(decision.confidence * 100).toFixed(0)}%)`);
        pushLog(`SKU correto correspondente: "${decision.matchedSku}"`);
        
        // Simular a escrita no UpSeller
        pushLog(`Executando mapeamento do anúncio simples no UpSeller...`);
        const mapSuccess = await driver.updateMarketplaceSKU(listing.marketplace, listing.marketplace_listing_id, decision.matchedSku);
        
        if (mapSuccess) {
          mappedCount++;
          // Atualiza banco
          await sync.updateListingMapping(clientId, listing.marketplace, listing.marketplace_listing_id, {
            status: 'mapped',
            mapped_sku: decision.matchedSku,
            detected_type: 'simple'
          }).catch(() => null);
          pushLog(`Mapeamento simples concluído com sucesso.`);
        } else {
          pushLog(`Erro ao atualizar SKU do anúncio no marketplace.`);
        }
      } 
      else if (decision.type === 'kit' && decision.components) {
        pushLog(`Classificado como: KIT (Confiança: ${(decision.confidence * 100).toFixed(0)}%)`);
        
        // Determinar o SKU do Kit de acordo com as regras de normalização de cores
        const firstComp = decision.components[0];
        const supplier = firstComp.sku.split('-')[0] || 'WM';
        // Extrai o sku base (ex: AN-SAIDA-CALCA FAIXA)
        const parts = firstComp.sku.split('-');
        let skuBase = '';
        if (parts.length >= 2) {
          parts.shift(); // remove fornecedor
          parts.pop(); // remove cor
          parts.pop(); // remove tamanho
          skuBase = parts.join('-');
        } else {
          skuBase = 'KIT-PRODUTO';
        }
        
        // Cores e tamanhos
        const colors = decision.components.map(c => {
          const p = c.sku.split('-');
          return p[p.length - 2] || 'Unica';
        });
        const size = firstComp.sku.split('-').pop() || 'U';
        const totalQty = decision.components.reduce((acc, c) => acc + c.qty, 0);

        const kitSku = buildKitSkuName(skuBase, totalQty, colors, size);
        pushLog(`Kit SKU gerado seguindo as regras de nomenclatura: "${kitSku}"`);

        // Verifica se Kit já existe no UpSeller
        pushLog(`Verificando se o Kit SKU "${kitSku}" já existe no Armazém do UpSeller...`);
        
        // Simula a criação do kit no armazém do UpSeller
        const kitCreated = await driver.createWarehouseKit(kitSku, decision.components);
        
        if (kitCreated) {
          kitsCreatedCount++;
          // Cadastra o kit localmente no WiseMentor
          await sync.upsertWarehouseKit({
            client_id: clientId,
            kit_sku: kitSku,
            title: listing.title,
            image_url: listing.image_url,
            components: decision.components,
            created_in_upseller: true
          }).catch(() => null);

          // Realiza o mapeamento no UpSeller
          pushLog(`Associando o anúncio do marketplace ao Kit do Armazém criado...`);
          const mapSuccess = await driver.updateMarketplaceSKU(listing.marketplace, listing.marketplace_listing_id, kitSku);
          
          if (mapSuccess) {
            mappedCount++;
            await sync.updateListingMapping(clientId, listing.marketplace, listing.marketplace_listing_id, {
              status: 'mapped',
              mapped_sku: kitSku,
              detected_type: 'kit'
            }).catch(() => null);
            pushLog(`Mapeamento do Kit concluído com sucesso.`);
          } else {
            pushLog(`Erro ao atualizar o SKU do anúncio para o Kit SKU.`);
          }
        } else {
          pushLog(`Falha ao criar o Kit no armazém.`);
        }
      } 
      else {
        pushLog(`Aviso: Classificação inconclusiva. Enviando para Revisão Humana.`);
        reviewRequiredCount++;
        
        await sync.updateListingMapping(clientId, listing.marketplace, listing.marketplace_listing_id, {
          status: 'needs_review',
          detected_type: 'unknown',
          review_notes: decision.reason || 'Conflito visual e textual na base de dados.'
        }).catch(() => null);
        
        pushLog(`Anúncio marcado como "Necessita Revisão Humana".`);
      }
    }

    pushLog('========================================');
    pushLog(`Execução concluída!`);
    pushLog(`Estatísticas: Extraídos: ${scrapedCount} | Mapeados: ${mappedCount} | Kits Criados: ${kitsCreatedCount} | Em Revisão: ${reviewRequiredCount}`);

    // Salvar sessão final no banco
    if (sessionId) {
      await sync.updateSession(sessionId, {
        status: 'completed',
        logs,
        scraped_count: scrapedCount,
        mapped_count: mappedCount,
        kits_created_count: kitsCreatedCount,
        review_required_count: reviewRequiredCount
      }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      scrapedCount,
      mappedCount,
      kitsCreatedCount,
      reviewRequiredCount,
      logs
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
