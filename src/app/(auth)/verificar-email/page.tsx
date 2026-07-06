import Link from 'next/link'

export default function VerificarEmailPage() {
  return (
    <div className="auth-card" style={{ textAlign: 'center' }}>
      {/* Ícone */}
      <div className="verify-icon">📬</div>

      {/* Logo */}
      <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: '1.25rem' }}>
        <div className="auth-logo-icon">🎓</div>
        <span className="auth-logo-name">WiseMentor</span>
      </div>

      {/* Conteúdo */}
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Verifique seu e-mail</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.625rem', lineHeight: 1.6 }}>
          Enviamos um link de confirmação para o seu e-mail.
          <br />
          Clique no link para ativar sua conta e começar a usar o WiseMentor.
        </p>
      </div>

      {/* Dica */}
      <div
        className="alert alert-success"
        role="note"
        style={{ marginBottom: '1.5rem', textAlign: 'left' }}
      >
        <span>💡</span>
        <span>
          Não encontrou o e-mail? Verifique a pasta de <strong>spam ou lixo eletrônico</strong>.
        </span>
      </div>

      {/* Rodapé */}
      <div className="auth-footer">
        <span>
          Já confirmou?{' '}
          <Link href="/login" className="auth-link">
            Fazer login
          </Link>
        </span>
      </div>
    </div>
  )
}
