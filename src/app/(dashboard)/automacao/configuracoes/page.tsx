'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../layout';

export default function AutomationSettings() {
  const { profile } = useDashboard();
  const supabase = createClient();

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cron, setCron] = useState('0 2 * * *');
  const [isActive, setIsActive] = useState(true);
  const [cookiesJson, setCookiesJson] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // 1. Carregar Clientes
  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (data && data.length > 0) {
        setClients(data);
        setSelectedClientId(data[0].id);
      } else {
        setLoading(false);
      }
    }
    loadClients();
  }, []);

  // 2. Carregar Configurações do Cliente Selecionado
  useEffect(() => {
    if (!selectedClientId) return;
    loadSettings();
  }, [selectedClientId]);

  async function loadSettings() {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch(`/api/automacao/settings?clientId=${selectedClientId}`);
      const data = await response.json();
      if (response.ok && data.settings) {
        const s = data.settings;
        setEmail(s.upseller_email || '');
        setPassword(''); // Senhas nunca são expostas de volta por segurança
        setCron(s.run_schedule || '0 2 * * *');
        setIsActive(s.is_active ?? true);
        setCookiesJson(s.session_cookies ? JSON.stringify(s.session_cookies, null, 2) : '');
      } else {
        // Limpa campos para novo cadastro
        setEmail('');
        setPassword('');
        setCron('0 2 * * *');
        setIsActive(true);
        setCookiesJson('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // 3. Salvar Configurações
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    let parsedCookies = {};
    if (cookiesJson.trim()) {
      try {
        parsedCookies = JSON.parse(cookiesJson);
      } catch (err) {
        setMessage({ type: 'error', text: 'O campo Cookies de Sessão deve ser um JSON válido.' });
        setSaving(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/automacao/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          upseller_email: email,
          upseller_password: password || undefined, // Apenas atualiza se digitado
          run_schedule: cron,
          is_active: isActive,
          session_cookies: parsedCookies
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Configurações de automação gravadas com sucesso!' });
        setPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Falha ao salvar configurações.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro de rede.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#e2e8f0' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚙️ Configurações da Automação UpSeller
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Cadastre credenciais e gerencie chaves de cookies de login para o robô RPA.
          </p>
        </div>

        {/* Client Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CLIENTE ATIVO</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="form-input"
            style={{ width: '250px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.5rem' }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Navegação Interna da Automação */}
      <nav style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #334155', marginBottom: '2rem', paddingBottom: '0.5rem' }}>
        <Link href="/automacao" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          📊 Painel
        </Link>
        <Link href="/automacao/mapeamento" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          🔗 Anúncios e Mapeamento
        </Link>
        <Link href="/automacao/produtos" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          📦 Base de Produtos (Truth)
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {/* Formulário de Configuração */}
      <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '2rem', maxWidth: '800px' }}>
        <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Parâmetros do Robô UpSeller RPA</h3>

        {message.text && (
          <div 
            className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} 
            style={{ marginBottom: '1.5rem' }}
          >
            <span>{message.type === 'success' ? '✅' : '⚠️'}</span>
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="auth-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* Email UpSeller */}
            <div className="form-field">
              <label className="form-label">E-mail de Login no UpSeller</label>
              <input
                type="email"
                className="form-input"
                placeholder="usuario@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ background: '#0d1117', color: '#fff' }}
              />
            </div>

            {/* Password UpSeller */}
            <div className="form-field">
              <label className="form-label">Senha de Login no UpSeller</label>
              <input
                type="password"
                className="form-input"
                placeholder={email ? '•••••••• (Preenchida)' : 'Digite a senha'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ background: '#0d1117', color: '#fff' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Deixe em branco para manter a senha cadastrada anteriormente.
              </span>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* Cron Schedule */}
            <div className="form-field">
              <label className="form-label">Agendamento de Execução (Cron)</label>
              <input
                type="text"
                className="form-input"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                required
                style={{ background: '#0d1117', color: '#fff' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Padrão: `0 2 * * *` (Executa diariamente às 2:00 da manhã).
              </span>
            </div>

            {/* Ativo */}
            <div className="form-field" style={{ justifyContent: 'center' }}>
              <label className="form-label" style={{ marginBottom: '0.5rem' }}>Status da Automação</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 600, color: isActive ? '#10b981' : 'var(--text-secondary)' }}>
                  {isActive ? 'AGENDAMENTO ATIVO' : 'AGENDAMENTO PAUSADO'}
                </span>
              </div>
            </div>

          </div>

          {/* Cookies Area */}
          <div className="form-field" style={{ marginBottom: '2rem' }}>
            <label className="form-label">Contorno de CAPTCHA: Cookies de Sessão (JSON)</label>
            <textarea
              className="form-input"
              rows={6}
              placeholder='[\n  { "name": "session_id", "value": "xxxx", "domain": ".upseller.com" }\n]'
              value={cookiesJson}
              onChange={(e) => setCookiesJson(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#0d1117', color: '#34d399', padding: '0.75rem', lineHeight: '1.4' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
              Utilize uma extensão como <strong>EditThisCookie</strong> no seu navegador após fazer login no UpSeller, exporte no formato JSON e cole acima para autenticação direta sem CAPTCHA.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={saving} 
              style={{ padding: '0.75rem 2rem', fontWeight: 600, marginTop: 0 }}
            >
              {saving ? <span className="spinner" /> : '💾 Salvar Configurações'}
            </button>
            
            <button 
              type="button" 
              onClick={() => {
                if (confirm('Deseja testar a conexão com estes parâmetros?')) {
                  alert('Teste de conexão simulado concluído com sucesso!');
                }
              }}
              className="btn-secondary" 
              style={{ padding: '0.75rem 1.5rem' }}
            >
              🔌 Testar Conexão RPA
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
