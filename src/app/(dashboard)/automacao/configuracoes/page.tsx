'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../../layout';

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

  const [showPassword, setShowPassword] = useState(false);
  const [selectedHour, setSelectedHour] = useState('02:00');
  const [showAdvancedCron, setShowAdvancedCron] = useState(false);

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
      }
      setLoading(false);
    }
    loadClients();
  }, []);

  // Recuperar cliente selecionado anteriormente do localStorage no lado do cliente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wisementor_automation_client_id');
      if (saved) {
        setSelectedClientId(saved);
      }
    }
  }, []);

  // 2. Carregar Configurações do Cliente Selecionado
  useEffect(() => {
    if (!selectedClientId) return;
    loadSettings();
  }, [selectedClientId]);

  async function loadSettings() {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setShowPassword(false);
    try {
      const response = await fetch(`/api/automacao/settings?clientId=${selectedClientId}`);
      const data = await response.json();
      if (response.ok && data.settings) {
        const s = data.settings;
        setEmail(s.upseller_email || '');
        setPassword(''); // Senhas nunca são expostas de volta por segurança
        
        const loadedCron = s.run_schedule || '0 2 * * *';
        setCron(loadedCron);
        
        // Tenta decodificar cron simples diário (formato: "0 H * * *")
        const match = loadedCron.trim().match(/^0\s+(\d+)\s+\*\s+\*\s+\*$/);
        if (match) {
          const hour = match[1].padStart(2, '0');
          setSelectedHour(`${hour}:00`);
          setShowAdvancedCron(false);
        } else {
          setShowAdvancedCron(true);
        }

        setIsActive(s.is_active ?? true);
        setCookiesJson(s.session_cookies ? JSON.stringify(s.session_cookies, null, 2) : '');
      } else {
        // Limpa campos para novo cadastro
        setEmail('');
        setPassword('');
        setCron('0 2 * * *');
        setSelectedHour('02:00');
        setShowAdvancedCron(false);
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

    let finalCron = cron;
    if (!showAdvancedCron) {
      const hour = parseInt(selectedHour.split(':')[0], 10);
      finalCron = `0 ${hour} * * *`;
    }

    try {
      const response = await fetch('/api/automacao/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          upseller_email: email,
          upseller_password: password || undefined, // Apenas atualiza se digitado
          run_schedule: finalCron,
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
            Cadastre credenciais e gerencie chaves de cookies de login para o robô de automação.
          </p>
        </div>

        {/* Client Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CLIENTE ATIVO</label>
          <select
            value={selectedClientId}
            onChange={(e) => {
              const cid = e.target.value;
              setSelectedClientId(cid);
              if (cid) {
                localStorage.setItem('wisementor_automation_client_id', cid);
              } else {
                localStorage.removeItem('wisementor_automation_client_id');
              }
            }}
            className="form-input"
            style={{ width: '250px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '0.5rem' }}
          >
            <option value="">Selecione um Cliente</option>
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
          📦 Base de Produtos
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {!selectedClientId ? (
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1.5rem' }}>⚙️</span>
          <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 600, margin: 0 }}>Nenhum Cliente Selecionado</h3>
          <p style={{ marginTop: '0.75rem', fontSize: '0.95rem', maxWidth: '600px', margin: '0.75rem auto 0', lineHeight: '1.6' }}>
            Por favor, selecione um cliente ativo no menu <strong>Cliente Ativo</strong> no canto superior direito para visualizar ou configurar as credenciais e parâmetros do robô UpSeller.
          </p>
        </div>
      ) : (
        /* Formulário de Configuração */
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '2rem', maxWidth: '800px' }}>
          <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            Parâmetros do Robô UpSeller 
            <span title="RPA (Robotic Process Automation) é a tecnologia de robô de software que automatiza tarefas repetitivas, imitando as ações de clique e digitação humanas no navegador." style={{ cursor: 'help', fontSize: '0.85rem', color: '#94a3b8', borderBottom: '1px dotted #64748b' }}>(RPA)</span>
          </h3>

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
                  placeholder="EX: contato@cliente.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ background: '#0d1117', color: '#fff' }}
                />
              </div>

              {/* Senha UpSeller com Olhinho */}
              <div className="form-field">
                <label className="form-label">Senha de Login (Criptografada)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder={email ? '•••••••• (Inalterada)' : 'Digite a senha do UpSeller'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={!email}
                    style={{ paddingRight: '2.5rem', width: '100%', background: '#0d1117', color: '#fff' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

            </div>

            {/* Agendamento de Automação */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              
              <div className="form-field">
                {!showAdvancedCron ? (
                  <>
                    <label className="form-label">Horário da Varredura Diária</label>
                    <select
                      value={selectedHour}
                      onChange={(e) => setSelectedHour(e.target.value)}
                      className="form-input"
                      style={{ background: '#0d1117', color: '#fff', padding: '0.55rem' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => {
                        const h = i.toString().padStart(2, '0');
                        const time = `${h}:00`;
                        let suffix = '';
                        if (i === 0) suffix = ' (Meia-noite)';
                        else if (i === 12) suffix = ' (Meio-dia)';
                        else if (i === 2) suffix = ' (Recomendado)';
                        else if (i >= 1 && i <= 11) suffix = ' da manhã';
                        else if (i >= 13 && i <= 18) suffix = ' da tarde';
                        else suffix = ' da noite';
                        return (
                          <option key={time} value={time}>
                            {time}{suffix}
                          </option>
                        );
                      })}
                    </select>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                      Escolha o horário em que o robô fará a varredura automática das vendas no UpSeller.
                    </span>
                  </>
                ) : (
                  <>
                    <label className="form-label">Agendamento de Varredura (Expressão Cron)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="EX: 0 2 * * * (Todo dia às 02h)"
                      value={cron}
                      onChange={(e) => setCron(e.target.value)}
                      required
                      style={{ background: '#0d1117', color: '#fff' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                      Expressão cron avançada de 5 campos (Minuto Hora Dia-do-Mês Mês Dia-da-Semana).
                    </span>
                  </>
                )}
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--primary)' }}>
                  <input
                    type="checkbox"
                    checked={showAdvancedCron}
                    onChange={(e) => setShowAdvancedCron(e.target.checked)}
                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  <span>⚙️ Configuração avançada de execução (Expressão CRON)</span>
                </label>
              </div>

              <div className="form-field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span>Habilitar automações diárias para este cliente</span>
                </label>
              </div>

            </div>

            {/* Guia de Ajuda de Cookies */}
            <div style={{ background: '#182030', border: '1px solid #2e3b52', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem', marginTop: '2rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                💡 O que são e como obter os Cookies de Sessão?
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Os cookies funcionam como uma <strong>&quot;chave digital pré-autorizada&quot;</strong>. Ao colar os cookies da conta do cliente aqui, o robô consegue acessar o painel do UpSeller sem precisar resolver desafios de letras/números (CAPTCHAs) chatos na hora do login.
              </p>
              
              <details style={{ marginTop: '0.75rem', cursor: 'pointer' }}>
                <summary style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Ver passo a passo simplificado para obter os cookies (Clique para expandir)</summary>
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li>Instale a extensão gratuita <a href="https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplfgbaggldgbgbinedjed" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>EditThisCookie</a> no seu navegador Google Chrome.</li>
                  <li>Acesse o painel do <a href="https://www.upseller.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>UpSeller</a> no Chrome, faça login normalmente na conta do cliente e deixe a página aberta.</li>
                  <li>Clique no ícone de biscoito (EditThisCookie) no canto superior direito do seu navegador.</li>
                  <li>Clique no botão de <strong>Exportar (ícone de seta para a direita)</strong>. Os cookies serão copiados automaticamente para a sua área de transferência.</li>
                  <li>Volte a esta tela e simplesmente <strong>cole (Ctrl+V)</strong> no campo de texto abaixo.</li>
                </ol>
              </details>
            </div>

            {/* Cookies JSON */}
            <div className="form-field" style={{ marginBottom: '2rem' }}>
              <label className="form-label">Cookies de Sessão do UpSeller (Opcional - Formato JSON)</label>
              <textarea
                className="form-input"
                placeholder='Ex: [ { "name": "sid", "value": "xyz123...", "domain": ".upseller.com" } ]'
                value={cookiesJson}
                onChange={(e) => setCookiesJson(e.target.value)}
                style={{ height: '120px', fontFamily: 'monospace', fontSize: '0.85rem', background: '#0d1117', color: '#fff' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Fornecer cookies válidos evita a necessidade de realizar o login visual com bypass de captcha em cada varredura.
              </span>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid #1e293b', paddingTop: '1.5rem' }}>
              <button 
                type="submit" 
                disabled={saving}
                className="btn-primary" 
                style={{ padding: '0.75rem 2rem', fontWeight: 600, marginTop: 0 }}
              >
                {saving ? 'Gravando...' : '💾 Salvar Parâmetros'}
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
                🔌 Testar Conexão do Robô
              </button>
            </div>

          </form>
        </div>
      )}
    </div>
  );
}
