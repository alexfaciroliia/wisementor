import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    // Parse body safely
    let email = ''
    try {
      const body = await request.json()
      email = (body?.email || '').toString().trim().toLowerCase()
    } catch {
      return NextResponse.json({ error: 'Formato de requisição inválido.' }, { status: 400 })
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Por favor, informe um e-mail válido.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Configuração do servidor incompleta (URL).' }, { status: 500 })
    }

    const origin = request.headers.get('origin') || 'https://wisementor-app.vercel.app'
    const redirectTo = `${origin}/auth/confirm?type=recovery`

    // ── Caminho 1: Service Role Key disponível → Admin API (gerar OTP + link)
    if (serviceRoleKey) {
      const generateRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          type: 'recovery',
          email,
          options: { redirect_to: redirectTo }
        })
      })

      const generateText = await generateRes.text()
      let generateData: any = {}
      try {
        generateData = generateText ? JSON.parse(generateText) : {}
      } catch {
        console.error('Erro ao parsear resposta da Admin API:', generateText)
        return NextResponse.json({ error: 'Erro ao contatar o servidor de autenticação.' }, { status: 500 })
      }

      if (!generateRes.ok) {
        const errMsg = generateData?.msg || generateData?.message || generateData?.error_description || 'Usuário não encontrado ou erro na geração do link.'
        return NextResponse.json({ error: errMsg }, { status: generateRes.status })
      }

      const otpCode = generateData?.properties?.email_otp || generateData?.email_otp
      const actionLink = generateData?.properties?.action_link || generateData?.action_link

      // Tentar enviar via Resend (falha silenciosa)
      const resendApiKey = process.env.RESEND_API_KEY
      if (resendApiKey && otpCode) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'WiseMentor <onboarding@resend.dev>',
              to: [email],
              subject: '🎓 Recuperação de Senha - WiseMentor',
              html: `<div style="font-family:Arial,sans-serif;padding:30px;background:#0f172a;color:#f8fafc;border-radius:10px;max-width:500px;margin:0 auto"><h2 style="color:#38bdf8">WiseMentor</h2><p>Você solicitou a redefinição de senha. Seu código de verificação:</p><div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#a855f7;margin:20px 0">${otpCode}</div>${actionLink ? `<div style="text-align:center;margin:25px 0"><a href="${actionLink}" style="background:#8b5cf6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Redefinir Minha Senha</a></div>` : ''}<p style="font-size:12px;color:#94a3b8">Se não solicitou, ignore este e-mail.</p></div>`
            })
          })
        } catch (e) {
          console.error('Resend silenced error:', e)
        }
      }

      return NextResponse.json({
        success: true,
        email,
        otpCode: otpCode || null,
        message: 'Instruções de recuperação enviadas.'
      })
    }

    // ── Caminho 2: Apenas Anon Key → endpoint público de recuperação (Supabase envia o e-mail)
    if (!anonKey) {
      return NextResponse.json({ error: 'Configuração do servidor incompleta (chave).' }, { status: 500 })
    }

    const resetRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, gotrue_meta_security: {} })
    })

    // Supabase /recover retorna 200 com corpo vazio quando bem sucedido
    if (!resetRes.ok) {
      const errText = await resetRes.text()
      let errData: any = {}
      try { errData = errText ? JSON.parse(errText) : {} } catch { /* ignore */ }
      const errMsg = errData?.msg || errData?.message || errData?.error_description || 'Erro ao solicitar recuperação de senha.'
      return NextResponse.json({ error: errMsg }, { status: resetRes.status })
    }

    return NextResponse.json({
      success: true,
      email,
      message: 'Instruções de recuperação enviadas para o e-mail cadastrado.'
    })

  } catch (err: any) {
    console.error('Erro geral reset-password:', err)
    return NextResponse.json({ error: err?.message || 'Erro interno no servidor.' }, { status: 500 })
  }
}
