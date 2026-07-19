import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DbSyncManager, DbListing, DbKit } from '@/lib/automation/db-sync';

// Mock de anúncios coletados em caso de base de dados vazia
const mockListings: DbListing[] = [
  {
    client_id: '00000000-0000-0000-0000-000000000000',
    marketplace: 'mercado_livre',
    marketplace_listing_id: 'MLB48210398',
    title: 'Kit 2 Calças Femininas Saída De Praia',
    image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=200&q=80',
    incorrect_sku: 'AN-SAIDA-CALCA-INVALIDO',
    status: 'unmapped',
    detected_type: 'kit'
  },
  {
    client_id: '00000000-0000-0000-0000-000000000000',
    marketplace: 'mercado_livre',
    marketplace_listing_id: 'MLB39210982',
    title: 'Kit 3 Cacharrel Feminina Trico G',
    image_url: 'https://images.unsplash.com/photo-1614975058789-41316d0e2e9c?w=200&q=80',
    incorrect_sku: 'AN-CACHARREL-TRICO-3X',
    status: 'unmapped',
    detected_type: 'kit'
  },
  {
    client_id: '00000000-0000-0000-0000-000000000000',
    marketplace: 'shopee',
    marketplace_listing_id: 'SHP982098231',
    title: 'Macacão Feminino Reverse Confortável',
    image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200&q=80',
    incorrect_sku: 'MACACAO-REV-ERRADO',
    status: 'needs_review',
    detected_type: 'unknown',
    review_notes: 'Ambiguidade visual: Foto combina 82% com "REVERSE" e 80% com "MULA MANCA".'
  },
  {
    client_id: '00000000-0000-0000-0000-000000000000',
    marketplace: 'shopee',
    marketplace_listing_id: 'SHP123908231',
    title: 'Vestido Feminino Mula Manca Moderno P',
    image_url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=200&q=80',
    incorrect_sku: 'MULA-MANCA-COR-TAM-TBD',
    status: 'mapped',
    detected_type: 'simple',
    mapped_sku: 'GI-MULA MANCA-Preto-P'
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
    const status = searchParams.get('status') as any;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório.' }, { status: 400 });
    }

    const sync = new DbSyncManager(supabase);
    const dbListings = await sync.getListings(clientId, status);

    if (dbListings.length === 0) {
      // Retorna mocks filtrando por status se solicitado
      let clientMocks = mockListings.map(l => ({ ...l, client_id: clientId }));
      if (status) {
        clientMocks = clientMocks.filter(l => l.status === status);
      }
      return NextResponse.json({ listings: clientMocks, source: 'mock' });
    }

    return NextResponse.json({ listings: dbListings, source: 'db' });
  } catch (err: any) {
    return NextResponse.json({ listings: mockListings, source: 'fallback_error', warning: err.message });
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
    const { action, clientId, marketplace, listingId, targetSku, components, title, imageUrl } = body;

    if (!clientId || !marketplace || !listingId) {
      return NextResponse.json({ error: 'Parâmetros clientId, marketplace e listingId são obrigatórios.' }, { status: 400 });
    }

    const sync = new DbSyncManager(supabase);

    if (action === 'map_simple') {
      // 1. Mapear SKU simples no banco
      const success = await sync.updateListingMapping(clientId, marketplace, listingId, {
        mapped_sku: targetSku,
        status: 'mapped',
        detected_type: 'simple',
        review_notes: null
      });
      return NextResponse.json({ success });
    } 

    if (action === 'create_kit_mapping') {
      // 2. Mapear Kit (cria kit na tabela warehouse_kits e associa no listings)
      if (!targetSku || !components || !Array.isArray(components)) {
        return NextResponse.json({ error: 'Parâmetros targetSku e components são necessários para cadastrar kits.' }, { status: 400 });
      }

      // Salva o kit no banco local
      const kitData: DbKit = {
        client_id: clientId,
        kit_sku: targetSku,
        title: title || 'Kit Cadastrado Manualmente',
        image_url: imageUrl || '',
        components,
        created_in_upseller: false // Será criado pelo RPA na próxima execução
      };

      const kitSuccess = await sync.upsertWarehouseKit(kitData);
      if (!kitSuccess) {
        return NextResponse.json({ error: 'Falha ao salvar o kit no banco do WiseMentor.' }, { status: 500 });
      }

      // Atualiza o status do anúncio de unmapped/needs_review para mapped
      const mapSuccess = await sync.updateListingMapping(clientId, marketplace, listingId, {
        mapped_sku: targetSku,
        status: 'mapped',
        detected_type: 'kit',
        review_notes: null
      });

      return NextResponse.json({ success: mapSuccess });
    }

    if (action === 'flag_review') {
      // 3. Enviar anúncio para Revisão Humana
      const success = await sync.updateListingMapping(clientId, marketplace, listingId, {
        status: 'needs_review',
        review_notes: body.notes || 'Marcado para revisão manual pelo usuário.'
      });
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
