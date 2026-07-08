import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, rgba(108, 99, 255, 0.12), transparent 50%), #0d0f14',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)'
    }}>
      {/* Header */}
      <header style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '2rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.25rem', color: '#fff' }}>
          <span style={{ padding: '0.4rem 0.6rem', background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))', borderRadius: '8px', fontSize: '1rem' }}>🎓</span>
          WiseMentor
        </div>
        <div>
          {user ? (
            <Link href="/dashboard" className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', textDecoration: 'none' }}>
              Acessar Painel
            </Link>
          ) : (
            <Link href="/login" className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', textDecoration: 'none' }}>
              Entrar
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '4rem 1.5rem',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.375rem 0.75rem',
          background: 'rgba(108, 99, 255, 0.1)',
          border: '1px solid rgba(108, 99, 255, 0.2)',
          borderRadius: '20px',
          fontSize: '0.8rem',
          fontWeight: 500,
          color: '#a78bfa',
          marginBottom: '2rem'
        }}>
          ✨ A nova era da gestão de mentorias
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          maxWidth: '800px',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #fff 30%, var(--text-secondary) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Acelere o aprendizado e a gestão da sua equipe
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 2vw, 1.125rem)',
          color: 'var(--text-secondary)',
          maxWidth: '640px',
          lineHeight: 1.6,
          marginBottom: '3rem'
        }}>
          O WiseMentor é um ecossistema inteligente de mentorias e acompanhamento, projetado para organizar níveis de acesso, convidar novos membros com controle de expiração e monitorar o desenvolvimento do seu time de forma premium.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '5rem' }}>
          {user ? (
            <Link href="/dashboard" className="btn-primary" style={{ padding: '0.875rem 2rem', fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(108,99,255,0.4)' }}>
              Ir para o Dashboard 📊
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-primary" style={{ padding: '0.875rem 2rem', fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(108,99,255,0.4)' }}>
                Entrar no Sistema
              </Link>
              <Link href="/login" className="btn-secondary" style={{ padding: '0.875rem 2rem', fontSize: '1rem', textDecoration: 'none' }}>
                Primeiro Acesso (Usar Convite)
              </Link>
            </>
          )}
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          width: '100%',
          marginTop: '2rem'
        }}>
          <div className="auth-card" style={{ maxWidth: '100%', padding: '2.25rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '1.75rem' }}>👥</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Níveis de Acesso Dinâmicos</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              Controle granular e restrições de permissões para perfis do tipo Sistema, Administrador e Operador, garantindo segurança na administração do ecossistema.
            </p>
          </div>

          <div className="auth-card" style={{ maxWidth: '100%', padding: '2.25rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '1.75rem' }}>⏳</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Prazos de Convite Customizáveis</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              Determine prazos limites de expiração para cada convite (24h, 48h, 7d ou datas personalizadas) e conte com reenvios rápidos com anulação de hashes antigas.
            </p>
          </div>

          <div className="auth-card" style={{ maxWidth: '100%', padding: '2.25rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '1.75rem' }}>🎨</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aparência Ultra Premium</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              Interface moderna construída sob um design system escuro sutil, com micro-animações interativas, tempos de carregamento instantâneos e suporte a dispositivos móveis.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem'
      }}>
        &copy; {new Date().getFullYear()} WiseMentor. Todos os direitos reservados.
      </footer>
    </div>
  )
}
