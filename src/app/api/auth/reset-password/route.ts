import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    // 1. Parse body
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

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Configuração do servidor incompleta.' }, { status: 500 })
    }

    const origin = request.headers.get('origin') || 'https://wisementor-app.vercel.app'
    const redirectTo = `${origin}/auth/confirm?type=recovery`

    console.log('[reset-password] email:', email, '| serviceRoleKey:', !!serviceRoleKey)

    // ── Caminho 1: Service Role Key → Admin API generateLink (código OTP + link)
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo }
      })

      console.log('[reset-password] generateLink result:', { linkData, linkError })

      if (linkError) {
        return NextResponse.json({
          error: linkError.message || 'Não foi possível gerar o link de recuperação.'
        }, { status: 400 })
      }

      // Supabase Admin API retorna na raiz do objeto (não em .properties)
      const otpCode = (linkData as any)?.email_otp || linkData?.properties?.email_otp
      const actionLink = (linkData as any)?.action_link || linkData?.properties?.action_link
      console.log('[reset-password] otpCode:', otpCode, '| actionLink:', !!actionLink)

      // Tentar Resend (falha silenciosa)
      const resendApiKey = process.env.RESEND_API_KEY
      if (resendApiKey && otpCode) {
        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'WiseMentor <onboarding@resend.dev>',
              to: [email],
              subject: '🎓 Recuperação de Senha - WiseMentor',
              html: `<div style="font-family:Arial,sans-serif;padding:30px;background:#0f172a;color:#f8fafc;border-radius:10px;max-width:500px;margin:0 auto">
                <h2 style="color:#38bdf8">WiseMentor</h2>
                <p>Você solicitou a redefinição de senha. Seu código de verificação:</p>
                <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#a855f7;margin:20px 0">${otpCode}</div>
                ${actionLink ? `<div style="text-align:center;margin:25px 0"><a href="${actionLink}" style="background:#8b5cf6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Redefinir Minha Senha</a></div>` : ''}
                <p style="font-size:12px;color:#94a3b8">Se não solicitou, ignore este e-mail.</p>
              </div>`
            })
          })
          const resendJson = await resendRes.json()
          console.log('[reset-password] Resend result:', resendJson)
        } catch (e) {
          console.error('[reset-password] Resend error silenced:', e)
        }
      }

      return NextResponse.json({
        success: true,
        email,
        otpCode: otpCode || null,
        message: 'Instruções de recuperação enviadas com sucesso.'
      })
    }

    // ── Caminho 2: Sem Service Role Key → resetPasswordForEmail via anon client (Supabase envia o email)
    console.log('[reset-password] usando anon client resetPasswordForEmail')

    const anonClient = createClient(supabaseUrl, anonKey)
    const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo
    })

    console.log('[reset-password] resetPasswordForEmail result error:', resetError)

    if (resetError) {
      return NextResponse.json({
        error: resetError.message || 'Erro ao enviar e-mail de recuperação.'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      email,
      message: 'Instruções enviadas para o e-mail cadastrado. Verifique sua caixa de entrada e spam.'
    })

  } catch (err: any) {
    console.error('[reset-password] Erro geral:', err)
    return NextResponse.json({ error: err?.message || 'Erro interno no servidor.' }, { status: 500 })
  }
}
