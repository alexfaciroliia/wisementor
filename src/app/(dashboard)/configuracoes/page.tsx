'use client'

import { useDashboard } from '../layout'

export default function ConfiguracoesPage() {
  const { profile } = useDashboard()

  return (
    <div>
      <div className="content-header">
        <h2 className="content-title">Configurações</h2>
        <p className="content-subtitle">Ajustes gerais do sistema WiseMentor</p>
      </div>

      <div className="auth-card" style={{ maxWidth: '100%', padding: '2.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gerais</h4>
            <p style={{ color: '#8b8fa8', fontSize: '0.875rem' }}>Ajustes e dados gerais da plataforma de mentoria.</p>
          </div>
          
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
          
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Políticas de Convites</h4>
            <p style={{ color: '#8b8fa8', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {profile?.role === 'sistema' 
                ? 'Configurado como privado (Apenas Sistema e Administradores podem convidar).'
                : 'Configurado como privado (Apenas Master/Administrador pode convidar).'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
