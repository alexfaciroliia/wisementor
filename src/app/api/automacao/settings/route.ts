import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { data, error } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ settings: null, warning: error.message });
    }

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    return NextResponse.json({ settings: null, error: err.message });
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
    const { clientId, upseller_email, upseller_password, session_cookies, custom_parameters, is_active, run_schedule } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório.' }, { status: 400 });
    }

    // Buscar registro existente para não sobrescrever o e-mail caso o usuário altere apenas parâmetros
    const { data: existing } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    const upsertData: any = {
      client_id: clientId,
      upseller_email: upseller_email || existing?.upseller_email || 'cliente@wisementor.com',
      is_active: is_active ?? true,
      run_schedule: run_schedule || '0 2 * * *'
    };

    if (session_cookies !== undefined) {
      upsertData.session_cookies = session_cookies;
    }

    if (custom_parameters !== undefined) {
      // Mesclar parâmetros dentro de session_cookies se necessário ou salvar
      const currentCookies = existing?.session_cookies || {};
      if (typeof currentCookies === 'object' && !Array.isArray(currentCookies)) {
        upsertData.session_cookies = { ...currentCookies, custom_parameters };
      } else {
        upsertData.session_cookies = { raw_cookies: currentCookies, custom_parameters };
      }
    }

    if (upseller_password) {
      upsertData.upseller_password_encrypted = Buffer.from(upseller_password).toString('base64');
    }

    const { data, error } = await supabase
      .from('automation_settings')
      .upsert(upsertData, { onConflict: 'client_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: data?.[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
