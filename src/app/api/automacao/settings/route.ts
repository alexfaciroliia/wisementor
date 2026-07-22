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
    const { clientId, upseller_email, upseller_password, session_cookies, is_active, run_schedule } = body;

    if (!clientId || !upseller_email) {
      return NextResponse.json({ error: 'clientId e upseller_email são obrigatórios.' }, { status: 400 });
    }

    const upsertData: any = {
      client_id: clientId,
      upseller_email,
      is_active: is_active ?? true,
      run_schedule: run_schedule || '0 2 * * *'
    };

    if (session_cookies !== undefined) {
      upsertData.session_cookies = session_cookies;
    }

    if (upseller_password) {
      // Em produção, isso seria criptografado com chaves secretas do servidor.
      // Por enquanto, salvamos no campo upseller_password_encrypted de forma transparente.
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
