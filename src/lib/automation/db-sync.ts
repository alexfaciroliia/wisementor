/**
 * db-sync.ts
 * Módulo Sincronizador de Banco de Dados (Supabase)
 * Faz a interface entre o motor de automação e as tabelas do WiseMentor.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface DbProduct {
  id?: string;
  client_id: string;
  description: string;
  supplier: string;
  sku_upseller: string;
  color?: string[];
  size?: string[];
  image_url?: string;
  image_hash?: string;
  cost_price?: number;
}

export interface DbListing {
  id?: string;
  client_id: string;
  marketplace: string;
  marketplace_listing_id: string;
  title: string;
  image_url?: string;
  incorrect_sku?: string;
  mapped_sku?: string;
  status: 'unmapped' | 'mapped' | 'needs_review';
  detected_type?: 'simple' | 'kit' | 'unknown';
  review_notes?: string;
}

export interface DbKit {
  id?: string;
  client_id: string;
  kit_sku: string;
  title: string;
  image_url?: string;
  components: { sku: string; qty: number }[];
  created_in_upseller?: boolean;
}

export class DbSyncManager {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Obtém a base de produtos (Fonte da Verdade) do cliente
   */
  public async getProducts(clientId: string): Promise<DbProduct[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select('*')
      .eq('client_id', clientId);

    if (error) {
      console.error('Erro ao buscar produtos:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Insere ou atualiza produtos em lote
   */
  public async upsertProducts(products: DbProduct[]): Promise<boolean> {
    if (products.length === 0) return true;

    const { error } = await this.supabase
      .from('products')
      .upsert(products, { onConflict: 'client_id,sku_upseller' });

    if (error) {
      console.error('Erro ao salvar produtos no banco:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Salva anúncios extraídos do UpSeller no banco do Supabase
   */
  public async syncMarketplaceListings(listings: DbListing[]): Promise<boolean> {
    if (listings.length === 0) return true;

    const { error } = await this.supabase
      .from('marketplace_listings')
      .upsert(listings, { onConflict: 'client_id,marketplace,marketplace_listing_id' });

    if (error) {
      console.error('Erro ao sincronizar anúncios no banco:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Obtém anúncios do marketplace por status
   */
  public async getListings(clientId: string, status?: 'unmapped' | 'mapped' | 'needs_review'): Promise<DbListing[]> {
    let query = this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('client_id', clientId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar anúncios:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Atualiza o mapeamento de um anúncio específico
   */
  public async updateListingMapping(
    clientId: string,
    marketplace: string,
    listingId: string,
    updateData: Partial<DbListing>
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('marketplace_listings')
      .update(updateData)
      .eq('client_id', clientId)
      .eq('marketplace', marketplace)
      .eq('marketplace_listing_id', listingId);

    if (error) {
      console.error('Erro ao atualizar mapeamento:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Obtém um kit cadastrado
   */
  public async getWarehouseKit(clientId: string, kitSku: string): Promise<DbKit | null> {
    const { data, error } = await this.supabase
      .from('warehouse_kits')
      .select('*')
      .eq('client_id', clientId)
      .eq('kit_sku', kitSku)
      .maybeSingle();

    if (error) {
      console.error('Erro ao obter kit do armazém:', error.message);
      return null;
    }
    return data;
  }

  /**
   * Cadastra ou atualiza um kit no banco do WiseMentor
   */
  public async upsertWarehouseKit(kit: DbKit): Promise<boolean> {
    const { error } = await this.supabase
      .from('warehouse_kits')
      .upsert(kit, { onConflict: 'client_id,kit_sku' });

    if (error) {
      console.error('Erro ao salvar kit no banco:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Cria uma nova sessão de execução de automação
   */
  public async createSession(clientId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('automation_sessions')
      .insert({
        client_id: clientId,
        status: 'running',
        logs: ['[INFO] Sessão de automação iniciada.'],
        scraped_count: 0,
        mapped_count: 0,
        kits_created_count: 0,
        review_required_count: 0
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao criar sessão de automação:', error.message);
      return null;
    }
    return data.id;
  }

  /**
   * Atualiza logs e estatísticas de uma sessão ativa
   */
  public async updateSession(
    sessionId: string,
    updates: {
      status?: 'running' | 'completed' | 'failed' | 'cancelled';
      logs?: string[];
      scraped_count?: number;
      mapped_count?: number;
      kits_created_count?: number;
      review_required_count?: number;
      error_message?: string;
    }
  ): Promise<boolean> {
    const patchData: any = {};
    if (updates.status) patchData.status = updates.status;
    if (updates.scraped_count !== undefined) patchData.scraped_count = updates.scraped_count;
    if (updates.mapped_count !== undefined) patchData.mapped_count = updates.mapped_count;
    if (updates.kits_created_count !== undefined) patchData.kits_created_count = updates.kits_created_count;
    if (updates.review_required_count !== undefined) patchData.review_required_count = updates.review_required_count;
    if (updates.error_message !== undefined) patchData.error_message = updates.error_message;
    
    if (updates.status && updates.status !== 'running') {
      patchData.ended_at = new Date().toISOString();
    }

    let promise;
    if (updates.logs) {
      // Faz o append dos logs no array
      promise = this.supabase.rpc('append_automation_logs', {
        session_id: sessionId,
        new_logs: updates.logs
      });
    } else {
      promise = this.supabase
        .from('automation_sessions')
        .update(patchData)
        .eq('id', sessionId);
    }

    const { error } = await promise;
    if (error) {
      // Fallback se a RPC não existir ainda, faz update simples
      if (updates.logs) {
        const { data: current } = await this.supabase
          .from('automation_sessions')
          .select('logs')
          .eq('id', sessionId)
          .single();
        
        const combinedLogs = [...(current?.logs || []), ...updates.logs];
        const { error: fallbackError } = await this.supabase
          .from('automation_sessions')
          .update({ ...patchData, logs: combinedLogs })
          .eq('id', sessionId);
        
        if (fallbackError) {
          console.error('Erro no fallback de logs:', fallbackError.message);
          return false;
        }
        return true;
      }
      console.error('Erro ao atualizar sessão:', error.message);
      return false;
    }
    return true;
  }
}
