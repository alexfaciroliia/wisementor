import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  )
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Por favor, informe um e-mail válido.' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()
    const adminClient = getAdminClient()

    // 1. Verificar se o usuário existe no Supabase Auth
    const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      console.error('Erro ao listar usuários no Auth:', listError)
      return NextResponse.json({ error: 'Erro de comunicação ao verificar conta de usuário.' }, { status: 500 })
    }

    const user = usersData.users.find(u => u.email && u.email.toLowerCase() === cleanEmail)
    if (!user) {
      return NextResponse.json({ error: 'E-mail não encontrado no sistema. Por favor, verifique se digitou o endereço correto.' }, { status: 404 })
    }

    // 2. Gerar link e código OTP de recuperação via Admin Service Role
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://wisementor.app'
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: cleanEmail,
      options: {
        redirectTo: `${origin}/auth/confirm?type=recovery`
      }
    })

    if (linkError || !linkData?.properties) {
      console.error('Erro ao gerar código de recuperação:', linkError)
      return NextResponse.json({ error: linkError?.message || 'Não foi possível gerar o código de recuperação.' }, { status: 500 })
    }

    const otpCode = linkData.properties.email_otp
    const actionLink = linkData.properties.action_link

    // 3. Tentar enviar o e-mail via Resend API se houver chave configurada
    let emailSent = false
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
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

        const resendData = await resendRes.json()
        if (resendRes.ok && resendData.id) {
          emailSent = true
        } else {
          console.log('Resend aviso:', resendData.message || resendData)
        }
      } catch (err) {
        console.error('Erro ao enviar e-mail via Resend:', err)
      }
    }

    return NextResponse.json({
      success: true,
      emailSent,
      email: cleanEmail,
      otpCode,
      message: 'Código de recuperação gerado com sucesso.'
    })
  } catch (err: any) {
    console.error('Erro inesperado na rota reset-password:', err)
    return NextResponse.json({ error: err.message || 'Erro interno no servidor.' }, { status: 500 })
  }
}
