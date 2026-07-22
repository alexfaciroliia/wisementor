import { createClient } from '@/lib/supabase/client'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'
import { ProcessedListingResult, WarehouseProductItem } from '@/lib/excel/planilha_marketplace_parser'

export interface ClientParameter {
  id?: string
  client_id: string
  kit_keywords: string[]
  ignore_keywords: string[]
  auto_standardize_simples?: boolean
}

export async function getClientParameters(clientId: string): Promise<ClientParameter> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('client_parameters')
    .select('*')
    .eq('client_id', clientId)
    .single()

  if (error || !data) {
    return {
      client_id: clientId,
      kit_keywords: ['kit', '+', 'pack', 'combo', 'jogo'],
      ignore_keywords: ['conjunto'],
      auto_standardize_simples: true
    }
  }

  return data as ClientParameter
}

export async function saveClientParameters(params: ClientParameter): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('client_parameters')
    .upsert({
      client_id: params.client_id,
      kit_keywords: params.kit_keywords,
      ignore_keywords: params.ignore_keywords,
      auto_standardize_simples: params.auto_standardize_simples ?? true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function saveWarehouseProducts(clientId: string, variants: ParsedProductVariant[]): Promise<{ success: boolean; savedCount: number; error?: string }> {
  if (!clientId || variants.length === 0) {
    return { success: true, savedCount: 0 }
  }

  const supabase = createClient()

  const payload = variants.map(v => ({
    client_id: clientId,
    spu: v.spu,
    sku: v.sku,
    product_name: v.title,
    supplier: v.supplier,
    reference_model: v.referenceModel,
    color: v.color,
    size: v.size,
    image_url: v.imageUrl,
    cost_price: v.costPrice || 0,
    is_kit_native: v.isKitNative || false,
    updated_at: new Date().toISOString()
  }))

  const { data, error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'client_id,sku' })

  if (error) {
    console.error('Erro ao salvar produtos no Supabase:', error)
    return { success: false, savedCount: 0, error: error.message }
  }

  return { success: true, savedCount: payload.length }
}

export async function fetchWarehouseProducts(clientId: string, spuFilter?: string): Promise<WarehouseProductItem[]> {
  const supabase = createClient()
  let query = supabase.from('products').select('spu, sku, color, size, product_name').eq('client_id', clientId)

  if (spuFilter) {
    query = query.ilike('spu', `%${spuFilter.trim()}%`)
  }

  const { data, error } = await query
  if (error || !data) {
    console.error('Erro ao buscar produtos do armazém:', error)
    return []
  }

  return data as WarehouseProductItem[]
}

export async function saveErrorLogs(clientId: string, batchId: string, stage: 'planilha_1_produtos' | 'planilha_marketplace', errorLogs: ErrorLogItem[]) {
  if (!clientId || errorLogs.length === 0) return

  const supabase = createClient()
  const payload = errorLogs.map(e => ({
    client_id: clientId,
    batch_id: batchId,
    stage,
    severity: e.type === 'ERRO' ? 'blocking_error' : 'warning',
    source_row: e.clientRow,
    item_identifier: e.productName,
    affected_field: e.field,
    original_value: e.originalValue,
    corrected_value: e.correctedValue,
    message: e.message
  }))

  await supabase.from('processing_error_logs').insert(payload)
}
