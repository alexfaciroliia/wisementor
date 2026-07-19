import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DbSyncManager, DbProduct } from '@/lib/automation/db-sync';
import { validateKitData, KitRow } from '@/lib/automation/decision-engine';

// Mock dataset em caso de falha de conexão ou tabela inexistente
const mockProducts: DbProduct[] = [
  {
    description: 'Calça Feminina Saída De Praia Fita',
    supplier: 'AN',
    sku_upseller: 'AN-SAIDA-CALCA FAIXA',
    color: ['Azul Bebe', 'Bege', 'Preto'],
    size: ['P', 'M', 'G', 'GG'],
    image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&q=80',
    cost_price: 49.90,
    client_id: '00000000-0000-0000-0000-000000000000'
  },
  {
    description: 'Blusa Cacharrel Feminina Trico Gola Alta',
    supplier: 'AN',
    sku_upseller: 'AN-CACHARREL',
    color: ['Preto', 'Branco', 'Vermelho'],
    size: ['U', 'G'],
    image_url: 'https://images.unsplash.com/photo-1614975058789-41316d0e2e9c?w=400&q=80',
    cost_price: 35.00,
    client_id: '00000000-0000-0000-0000-000000000000'
  },
  {
    description: 'Macacão Biquíni Reverse Versátil',
    supplier: 'GI',
    sku_upseller: 'REVERSE',
    color: ['Preto', 'Azul Marinho'],
    size: ['P', 'M', 'G'],
    image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&q=80',
    cost_price: 89.90,
    client_id: '00000000-0000-0000-0000-000000000000'
  },
  {
    description: 'Vestido Feminino Mula Manca Decotado',
    supplier: 'GI',
    sku_upseller: 'MULA MANCA',
    color: ['Preto', 'Pink', 'Verde Limao'],
    size: ['P', 'M'],
    image_url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&q=80',
    cost_price: 75.00,
    client_id: '00000000-0000-0000-0000-000000000000'
  }
];

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório.' }, { status: 400 });
    }

    const sync = new DbSyncManager(supabase);
    const dbProducts = await sync.getProducts(clientId);

    if (dbProducts.length === 0) {
      return NextResponse.json({ products: [], source: 'db' });
    }

    return NextResponse.json({ products: dbProducts, source: 'db' });
  } catch (err: any) {
    return NextResponse.json({ products: mockProducts, source: 'fallback_error', warning: err.message });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const { clientId, products, isKitsValidation, kitRows } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório.' }, { status: 400 });
    }

    // Se a requisição for para validar uma planilha de Kits (.xlsx import/validate)
    if (isKitsValidation && kitRows) {
      const validation = validateKitData(kitRows as KitRow[]);
      return NextResponse.json(validation);
    }

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Lista de produtos inválida.' }, { status: 400 });
    }

    // Trata do upload/cadastro de produtos normais da Fonte da Verdade
    const productsToUpsert: DbProduct[] = products.map((p: any) => ({
      client_id: clientId,
      description: p.description || p.Produto || 'Sem Descrição',
      supplier: p.supplier || p.Fornecedor || 'WM',
      sku_upseller: p.sku_upseller || p.SkuUpseller || '',
      color: Array.isArray(p.color) ? p.color : (p.Cor ? String(p.Cor).split(',') : []),
      size: Array.isArray(p.size) ? p.size : (p.Tamanho ? String(p.Tamanho).split(',') : []),
      image_url: p.image_url || p.Imagem || '',
      image_hash: p.image_hash || '',
      cost_price: Number(p.cost_price || p.Preço || 0)
    })).filter(p => p.sku_upseller !== '');

    const sync = new DbSyncManager(supabase);
    const success = await sync.upsertProducts(productsToUpsert);

    if (!success) {
      return NextResponse.json({ error: 'Falha ao sincronizar com o banco de dados.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: productsToUpsert.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
