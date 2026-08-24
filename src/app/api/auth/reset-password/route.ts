import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Formato de requisição inválido.' }, { status: 400 })
    }

    const { email } = body
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Por favor, informe um e-mail válido.' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Configuração do Supabase URL ausente no servidor.' }, { status: 500 })
    }

    // Se a Service Role Key estiver configurada no servidor, usar o cliente Admin do Supabase
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      // Gerar link e código OTP via Admin API (sem bloqueio de CORS / rate limit de cliente)
      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://wisementor-app.vercel.app'
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
        options: {
          redirectTo: `${origin}/auth/confirm?type=recovery`
        }
      })

      if (linkError) {
        console.error('Erro no generateLink Admin:', linkError)
        return NextResponse.json({ error: `Não foi possível gerar a recuperação: ${linkError.message}` }, { status: 400 })
      }

      const otpCode = linkData?.properties?.email_otp
      const actionLink = linkData?.properties?.action_link

      // Tentar enviar e-mail via Resend se configurado
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
              to: [cleanEmail],
              subject: '🎓 Recuperação de Senha - WiseMentor',
              html: `
                <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto;">
                  <h2 style="color: #38bdf8;">WiseMentor</h2>
                  <p>Olá,</p>
                  <p>Você solicitou a redefinição da sua senha no sistema <strong>WiseMentor</strong>.</p>
                  <p>Seu código de verificação é:</p>
                  <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #a855f7; margin: 20px 0;">
                    ${otpCode}
                  </div>
                  <p>Ou clique no botão abaixo para redefinir diretamente:</p>
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${actionLink}" style="background-color: #8b5cf6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
                  </div>
                  <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">Se não solicitou a alteração de senha, ignore este e-mail.</p>
                </div>
              `
            })
          })
        } catch (e) {
          console.error('Erro Resend:', e)
        }
      }

      return NextResponse.json({
        success: true,
        email: cleanEmail,
        otpCode,
        message: 'Instruções de recuperação geradas com sucesso.'
      })
    } else {
      // Fallback: usar o Anon Client no servidor
      const anonClient = createClient(supabaseUrl, anonKey)
      const origin = request.headers.get('origin') || 'https://wisementor-app.vercel.app'
      const { error: resetErr } = await anonClient.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${origin}/auth/confirm?type=recovery`
      })

      if (resetErr) {
        return NextResponse.json({ error: resetErr.message || 'Erro ao enviar e-mail de recuperação.' }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        email: cleanEmail,
        message: 'Instruções de recuperação enviadas com sucesso.'
      })
    }
  } catch (err: any) {
    console.error('Erro geral na rota reset-password:', err)
    return NextResponse.json({ error: err.message || 'Ocorreu um erro interno no servidor.' }, { status: 500 })
  }
}
