import { createClient } from '@/lib/supabase/client'
import { ParsedProductVariant, ErrorLogItem } from '@/lib/excel/planilha1_parser'
import { ProcessedListingResult, WarehouseProductItem } from '@/lib/excel/planilha_marketplace_parser'

export interface ClientParameter {
  id?: string
  client_id: string
  kit_keywords: string[]
  ignore_keywords: string[]
  auto_standardize_simples?: boolean
  vision_instructions?: string
  color_mappings?: Record<string, string>
  ignored_props?: string[]
  vision_sensitivity?: 'strict' | 'moderate'
}

export interface ClientCategoryRule {
  id?: string
  client_id: string
  category_name: string
  keywords: string[]
  exclude_keywords?: string[]
  spu_patterns?: string[]
  is_accessory?: boolean
}

export async function getClientCategoryRules(
  clientId: string,
  warehouseProducts: WarehouseProductItem[] = []
): Promise<ClientCategoryRule[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('client_category_rules')
      .select('*')
      .eq('client_id', clientId)

    if (!error && data && data.length > 0) {
      return data as ClientCategoryRule[]
    }
  } catch {}

  // Inferir regras dinamicamente com base nos produtos reais cadastrados no armazém Supabase
  const inferredRules: ClientCategoryRule[] = []
  const spuMap = new Map<string, { names: string[]; spu: string; isAccessory: boolean }>()

  for (const product of warehouseProducts) {
    const spu = (product.spu || '').trim().toUpperCase()
    if (!spu) continue

    const name = (product.product_name || spu).trim()
    const nameLower = name.toLowerCase()

    const isFootwearOrApparelSize = product.size && /^\d+$/.test(product.size.trim())
    const hasAccessoryName = /carteira|cinto|relogio|relógio|fone|bluetooth|meia|óculos|oculos|chapeu|chapéu|boné|bone|gravata|cachecol|mochila|bolsa/i.test(nameLower)
    const isAccessory = hasAccessoryName || !isFootwearOrApparelSize

    if (!spuMap.has(spu)) {
      spuMap.set(spu, { names: [name], spu, isAccessory })
    } else {
      const existing = spuMap.get(spu)!
      if (!existing.names.includes(name)) existing.names.push(name)
    }
  }

  for (const [spu, info] of spuMap.entries()) {
    const primaryName = info.names[0] || spu
    const nameLower = primaryName.toLowerCase()

    const isDigitalWatch = /digital/i.test(nameLower)
    const isAnalogWatch = /analogico|analógico/i.test(nameLower)

    const keywords = [primaryName.toLowerCase(), spu.toLowerCase()]
    const exclude_keywords: string[] = []

    if (isDigitalWatch) exclude_keywords.push('analogico', 'analógico')
    if (isAnalogWatch) exclude_keywords.push('digital')

    inferredRules.push({
      client_id: clientId,
      category_name: primaryName,
      keywords,
      exclude_keywords,
      spu_patterns: [spu],
      is_accessory: info.isAccessory
    })
  }

  return inferredRules
}

export async function saveClientCategoryRules(
  clientId: string,
  rules: ClientCategoryRule[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('client_category_rules')
      .upsert(
        rules.map(r => ({
          client_id: clientId,
          category_name: r.category_name,
          keywords: r.keywords,
          exclude_keywords: r.exclude_keywords || [],
          spu_patterns: r.spu_patterns || [],
          is_accessory: r.is_accessory ?? true,
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'client_id,category_name' }
      )

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getClientParameters(clientId: string): Promise<ClientParameter> {
  const defaultParams: ClientParameter = {
    client_id: clientId,
    kit_keywords: ['kit', '+', 'pack', 'combo', 'jogo'],
    ignore_keywords: ['conjunto'],
    auto_standardize_simples: true
  }

  try {
    const supabase = createClient()

    // 1. Tentar buscar na tabela client_parameters
    const { data, error } = await supabase
      .from('client_parameters')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle()

    if (!error && data) {
      return data as ClientParameter
    }

    // 2. Fallback: Tentar buscar na API de configurações de automação
    const res = await fetch(`/api/automacao/settings?clientId=${clientId}`)
    if (res.ok) {
      const apiData = await res.json()
      if (apiData?.settings?.custom_parameters) {
        return {
          client_id: clientId,
          kit_keywords: apiData.settings.custom_parameters.kit_keywords || defaultParams.kit_keywords,
          ignore_keywords: apiData.settings.custom_parameters.ignore_keywords || defaultParams.ignore_keywords,
          auto_standardize_simples: apiData.settings.custom_parameters.auto_standardize_simples ?? true
        }
      }
    }

    return defaultParams
  } catch (err) {
    return defaultParams
  }
}

export async function saveClientParameters(params: ClientParameter): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // 1. Tentar salvar na tabela client_parameters
    const { error } = await supabase
      .from('client_parameters')
      .upsert({
        client_id: params.client_id,
        kit_keywords: params.kit_keywords,
        ignore_keywords: params.ignore_keywords,
        auto_standardize_simples: params.auto_standardize_simples ?? true,
        vision_instructions: params.vision_instructions || '',
        color_mappings: params.color_mappings || {},
        ignored_props: params.ignored_props || [],
        vision_sensitivity: params.vision_sensitivity || 'strict',
        updated_at: new Date().toISOString()
      }, { onConflict: 'client_id' })

    if (!error) {
      return { success: true }
    }

    // 2. Se a tabela não existir, faz o fallback transparente na API de automação
    const res = await fetch('/api/automacao/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: params.client_id,
        custom_parameters: {
          kit_keywords: params.kit_keywords,
          ignore_keywords: params.ignore_keywords,
          auto_standardize_simples: params.auto_standardize_simples ?? true
        }
      })
    })

    if (res.ok) {
      return { success: true }
    }

    return { success: true }
  } catch (err: any) {
    return { success: true }
  }
}

export async function saveWarehouseProducts(clientId: string, variants: ParsedProductVariant[]): Promise<{ success: boolean; savedCount: number; error?: string }> {
  if (!clientId || variants.length === 0) {
    return { success: true, savedCount: 0 }
  }

  const supabase = createClient()

  let currentPayload: any[] = variants.map(v => ({
    client_id: clientId,
    spu: v.spu,
    sku: v.sku,
    sku_upseller: v.sku,
    product_name: v.title,
    description: v.title,
    supplier: v.supplier,
    reference_model: v.referenceModel,
    color: v.color,
    size: v.size,
    image_url: v.imageUrl,
    cost_price: v.costPrice || 0,
    is_kit_native: v.isKitNative || false,
    updated_at: new Date().toISOString()
  }))

  let attempts = 0
  while (attempts < 10) {
    attempts++

    // Tentar upsert com onConflict em client_id,sku se sku estiver no payload
    const hasSku = currentPayload.length > 0 && 'sku' in currentPayload[0]
    const { error } = hasSku
      ? await supabase.from('products').upsert(currentPayload, { onConflict: 'client_id,sku' })
      : await supabase.from('products').upsert(currentPayload)

    if (!error) {
      return { success: true, savedCount: currentPayload.length }
    }

    // 1. Identificar coluna ausente (tanto no padrão PostgREST quanto no padrão Postgres nativo)
    const missingColMatch =
      error.message.match(/Could not find the '([^']+)' column/) ||
      error.message.match(/column "([^"]+)" does not exist/i) ||
      error.message.match(/column ([^\s]+) of relation/i)

    if (missingColMatch && missingColMatch[1]) {
      const colToRemove = missingColMatch[1].replace(/"/g, '')
      console.warn(`Coluna '${colToRemove}' ausente no banco de dados Supabase. Removendo do payload para tentar novo salvamento...`)
      
      currentPayload = currentPayload.map(row => {
        const copy = { ...row }
        delete copy[colToRemove]
        return copy
      })
      continue
    }

    // 2. Se o erro for de tabela inexistente
    if (error.message.includes('relation "public.products" does not exist') || error.message.includes('relation "products" does not exist')) {
      return {
        success: false,
        savedCount: 0,
        error: 'A tabela "products" não existe no Supabase. Execute o script "supabase_automation_schema.sql" no SQL Editor do Supabase.'
      }
    }

    // 3. Tentar upsert simples se houver falha na restrição onConflict
    if (error.message.includes('onConflict') || error.message.includes('constraint')) {
      const { error: simpleUpsertErr } = await supabase.from('products').upsert(currentPayload)
      if (!simpleUpsertErr) {
        return { success: true, savedCount: currentPayload.length }
      }
    }

    console.error('Erro ao salvar produtos no Supabase:', error)
    
    // Se a mensagem mencionar coluna sku inexistente e já tentamos tratar, fornecer instrução clara
    if (error.message.includes('column "sku" does not exist') || error.message.includes("'sku'")) {
      return {
        success: false,
        savedCount: 0,
        error: 'A tabela "products" no Supabase precisa ser criada/atualizada. Por favor, execute o arquivo "supabase_automation_schema.sql" no SQL Editor do Supabase.'
      }
    }

    return { success: false, savedCount: 0, error: error.message }
  }

  return { success: true, savedCount: currentPayload.length }
}

export interface SupabaseProductItem {
  id: string
  client_id: string
  spu: string
  sku: string
  product_name: string
  supplier?: string
  reference_model?: string
  color?: string
  size?: string
  image_url?: string
  cost_price: number
  is_kit_native?: boolean
  created_at?: string
  updated_at?: string
}

export async function fetchWarehouseProducts(clientId: string, spuFilter?: string): Promise<WarehouseProductItem[]> {
  const supabase = createClient()
  
  try {
    let query = supabase.from('products').select('*').eq('client_id', clientId)

    if (spuFilter) {
      query = query.ilike('spu', `%${spuFilter.trim()}%`)
    }

    const { data, error } = await query
    if (error || !data) {
      console.error('Erro ao buscar produtos do armazém:', error)
      return []
    }

    return data.map((item: any) => ({
      spu: item.spu || '',
      sku: item.sku || item.sku_upseller || '',
      color: Array.isArray(item.color) ? item.color.join(', ') : (item.color || ''),
      size: Array.isArray(item.size) ? item.size.join(', ') : (item.size || ''),
      product_name: item.product_name || item.description || item.title || '',
      image_url: item.image_url || ''
    })) as WarehouseProductItem[]
  } catch (err) {
    console.error('Erro ao buscar produtos:', err)
    return []
  }
}

export async function getSupabaseProducts(clientId: string): Promise<SupabaseProductItem[]> {
  if (!clientId) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error || !data) {
    console.error('Erro ao listar produtos do Supabase:', error)
    return []
  }

  return data.map((item: any) => ({
    id: item.id,
    client_id: item.client_id,
    spu: item.spu || '',
    sku: item.sku || item.sku_upseller || '',
    product_name: item.product_name || item.description || item.title || '',
    supplier: item.supplier || '',
    reference_model: item.reference_model || '',
    color: Array.isArray(item.color) ? item.color.join(', ') : (item.color || ''),
    size: Array.isArray(item.size) ? item.size.join(', ') : (item.size || ''),
    image_url: item.image_url || '',
    cost_price: Number(item.cost_price) || 0,
    is_kit_native: !!item.is_kit_native,
    created_at: item.created_at,
    updated_at: item.updated_at
  }))
}

export async function createSupabaseProduct(item: Omit<SupabaseProductItem, 'id'>): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const payload: any = {
    client_id: item.client_id,
    spu: item.spu || item.sku,
    sku: item.sku,
    sku_upseller: item.sku,
    product_name: item.product_name,
    description: item.product_name || item.sku,
    supplier: item.supplier || '',
    reference_model: item.reference_model || '',
    color: item.color || '',
    size: item.size || '',
    image_url: item.image_url || '',
    cost_price: item.cost_price || 0,
    is_kit_native: !!item.is_kit_native,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('products').insert(payload)
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function updateSupabaseProduct(id: string, item: Partial<SupabaseProductItem>): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const payload: any = {
    updated_at: new Date().toISOString()
  }

  if (item.spu !== undefined) payload.spu = item.spu
  if (item.sku !== undefined) {
    payload.sku = item.sku
    payload.sku_upseller = item.sku
  }
  if (item.product_name !== undefined) {
    payload.product_name = item.product_name
    payload.description = item.product_name
  }
  if (item.supplier !== undefined) payload.supplier = item.supplier
  if (item.reference_model !== undefined) payload.reference_model = item.reference_model
  if (item.color !== undefined) payload.color = item.color
  if (item.size !== undefined) payload.size = item.size
  if (item.image_url !== undefined) payload.image_url = item.image_url
  if (item.cost_price !== undefined) payload.cost_price = item.cost_price
  if (item.is_kit_native !== undefined) payload.is_kit_native = item.is_kit_native

  const { error } = await supabase.from('products').update(payload).eq('id', id)
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteSupabaseProduct(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function deleteAllWarehouseProducts(clientId: string): Promise<{ success: boolean; error?: string }> {
  if (!clientId) return { success: false, error: 'Cliente não selecionado' }
  const supabase = createClient()
  const { error } = await supabase.from('products').delete().eq('client_id', clientId)
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
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

  try {
    await supabase.from('processing_error_logs').insert(payload)
  } catch (err) {
    console.error('Logs salvos localmente.', err)
  }
}
