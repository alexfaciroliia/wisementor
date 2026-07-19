/**
 * upseller-driver.ts
 * Módulo RPA de Interface (UpSeller Driver)
 * Contém o driver Playwright para interface com o painel do UpSeller.
 * (Skeleton funcional com Simulações e Logs detalhados para Homologação)
 */

export interface ScrapedListing {
  marketplace_listing_id: string;
  marketplace: string;
  title: string;
  image_url: string;
  incorrect_sku: string;
}

export interface KitComponent {
  sku: string;
  qty: number;
}

export class UpSellerDriver {
  private clientId: string;
  private logs: string[] = [];
  private logCallback?: (log: string) => void;

  constructor(clientId: string, onLog?: (log: string) => void) {
    this.clientId = clientId;
    this.logCallback = onLog;
  }

  private addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    this.logs.push(formatted);
    if (this.logCallback) {
      this.logCallback(formatted);
    }
    console.log(`[RPA Driver] ${message}`);
  }

  public getLogs(): string[] {
    return this.logs;
  }

  /**
   * Simula a autenticação no painel do UpSeller
   */
  public async login(): Promise<boolean> {
    this.addLog('Iniciando navegador Playwright (Stealth mode)...');
    await new Promise(r => setTimeout(r, 1000));
    
    this.addLog('Acessando página de Login do UpSeller: https://www.upseller.com/auth/login');
    await new Promise(r => setTimeout(r, 800));

    this.addLog('Preenchendo e-mail e senha cadastrados...');
    // Em produção: ler credentials do banco e preencher campos
    await new Promise(r => setTimeout(r, 600));

    this.addLog('Verificando session cookies salvos...');
    this.addLog('Login efetuado com sucesso! Sessão de cookies gravada.');
    return true;
  }

  /**
   * Extrai a lista de anúncios "Não Mapeados" do UpSeller
   */
  public async fetchUnmappedListings(): Promise<ScrapedListing[]> {
    this.addLog('Navegando para: produtos/gerenciar mapeamento...');
    await new Promise(r => setTimeout(r, 1500));

    this.addLog('Acessando aba "Não Mapeados"...');
    await new Promise(r => setTimeout(r, 1000));

    this.addLog('Detectando tabela de anúncios pendentes...');
    this.addLog('Coletando imagens, títulos e SKUs incorretos da página 1...');
    
    // Dados simulados realistas para a interface
    const mockListings: ScrapedListing[] = [
      {
        marketplace_listing_id: 'MLB48210398',
        marketplace: 'mercado_livre',
        title: 'Kit 2 Calças Femininas Saída De Praia',
        image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=150&q=80',
        incorrect_sku: 'AN-SAIDA-CALCA-INVALIDO'
      },
      {
        marketplace_listing_id: 'MLB39210982',
        marketplace: 'mercado_livre',
        title: 'Kit 3 Cacharrel Feminina Trico G',
        image_url: 'https://images.unsplash.com/photo-1614975058789-41316d0e2e9c?w=150&q=80',
        incorrect_sku: 'AN-CACHARREL-TRICO-3X'
      },
      {
        marketplace_listing_id: 'SHP982098231',
        marketplace: 'shopee',
        title: 'Macacão Feminino Reverse Confortável',
        image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=150&q=80',
        incorrect_sku: 'MACACAO-REV-ERRADO'
      },
      {
        marketplace_listing_id: 'SHP123908231',
        marketplace: 'shopee',
        title: 'Vestido Feminino Mula Manca Moderno P',
        image_url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=150&q=80',
        incorrect_sku: 'MULA-MANCA-COR-TAM-TBD'
      }
    ];

    this.addLog(`Extração concluída: ${mockListings.length} anúncios não mapeados identificados.`);
    return mockListings;
  }

  /**
   * Cria um Kit no Armazém do UpSeller
   */
  public async createWarehouseKit(kitSku: string, components: KitComponent[]): Promise<boolean> {
    this.addLog(`Navegando para: produto/produto do armazém/kit...`);
    await new Promise(r => setTimeout(r, 1200));

    this.addLog(`Pesquisando Kit SKU existente: "${kitSku}"...`);
    await new Promise(r => setTimeout(r, 800));

    this.addLog(`Kit não localizado. Clicando em "Criar Novo Kit"...`);
    await new Promise(r => setTimeout(r, 1000));

    this.addLog(`Preenchendo SKU do Kit com: "${kitSku}"`);
    
    for (const comp of components) {
      this.addLog(`Buscando componente individual no armazém: "${comp.sku}"...`);
      await new Promise(r => setTimeout(r, 600));
      this.addLog(`Componente "${comp.sku}" selecionado. Definindo quantidade = ${comp.qty}.`);
    }

    this.addLog('Salvando kit no armazém do UpSeller...');
    await new Promise(r => setTimeout(r, 1000));
    
    this.addLog(`Sucesso: Kit SKU "${kitSku}" criado com sucesso no armazém!`);
    return true;
  }

  /**
   * Atualiza o SKU de um anúncio ativo no Marketplace correspondente
   */
  public async updateMarketplaceSKU(
    marketplace: string,
    listingId: string,
    targetSku: string
  ): Promise<boolean> {
    this.addLog(`Navegando para: produtos / ${marketplace.replace('_', ' ')} / ativos...`);
    await new Promise(r => setTimeout(r, 1500));

    this.addLog(`Filtrando anúncios pelo ID do anúncio: "${listingId}"...`);
    await new Promise(r => setTimeout(r, 800));

    this.addLog('Anúncio localizado. Clicando no ícone de edição rápida do SKU...');
    await new Promise(r => setTimeout(r, 1000));

    this.addLog(`Limpando SKU atual e preenchendo com o correto: "${targetSku}"`);
    await new Promise(r => setTimeout(r, 600));

    this.addLog('Clicando em "Salvar"...');
    await new Promise(r => setTimeout(r, 1200));

    this.addLog(`Confirmação: SKU do anúncio MLB editado com sucesso para "${targetSku}".`);
    return true;
  }
}
