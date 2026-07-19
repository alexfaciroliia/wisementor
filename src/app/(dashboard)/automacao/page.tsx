'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../layout';

interface ClientData {
  id: string;
  name: string;
}

interface SessionData {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  ended_at: string | null;
  scraped_count: number;
  mapped_count: number;
  kits_created_count: number;
  review_required_count: number;
  logs: string[];
}

export default function AutomationDashboard() {
  const { profile } = useDashboard();
  const supabase = createClient();

  const [clients, setClients] = useState<ClientData[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [metrics, setMetrics] = useState({
    scraped: 0,
    mapped: 0,
    kits: 0,
    review: 0,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // 1. Carregar lista de clientes
  useEffect(() => {
    async function loadClients() {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (!error && data) {
        setClients(data);
        if (data.length > 0) {
          setSelectedClientId(data[0].id);
        }
      }
      setLoading(false);
    }
    loadClients();
  }, []);

  // 2. Carregar sessões de logs recentes para o cliente selecionado
  useEffect(() => {
    if (!selectedClientId) return;
    loadRecentSessions();
  }, [selectedClientId]);

  async function loadRecentSessions() {
    const { data, error } = await supabase
      .from('automation_sessions')
      .select('*')
      .eq('client_id', selectedClientId)
      .order('started_at', { ascending: false })
      .limit(5);

    if (!error && data) {
      setSessions(data);
      if (data.length > 0) {
        const last = data[0];
        setMetrics({
          scraped: last.scraped_count || 0,
          mapped: last.mapped_count || 0,
          kits: last.kits_created_count || 0,
          review: last.review_required_count || 0,
        });
        setLogs(last.logs || []);
        if (last.status === 'running') {
          setRunning(true);
          setStatus('running');
        } else if (last.status === 'completed') {
          setStatus('success');
        } else if (last.status === 'failed') {
          setStatus('error');
        }
      } else {
        // Reset se não houver sessões
        setMetrics({ scraped: 0, mapped: 0, kits: 0, review: 0 });
        setLogs(['Nenhuma execução anterior encontrada. Inicie para mapear os SKUs.']);
        setStatus('idle');
      }
    }
  }

  // Rolar terminal para o final quando novos logs entrarem
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // 3. Acionar motor de automação (RPA)
  async function handleStartAutomation() {
    if (!selectedClientId || running) return;

    setRunning(true);
    setStatus('running');
    setLogs(['[SISTEMA] Conectando ao motor de automação WiseMentor...', '[SISTEMA] Iniciando simulação RPA UpSeller...']);
    setMetrics({ scraped: 0, mapped: 0, kits: 0, review: 0 });

    try {
      const response = await fetch('/api/automacao/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLogs(data.logs || []);
        setMetrics({
          scraped: data.scrapedCount || 0,
          mapped: data.mappedCount || 0,
          kits: data.kitsCreatedCount || 0,
          review: data.reviewRequiredCount || 0,
        });
        setStatus('success');
      } else {
        setLogs(prev => [...prev, `[ERRO] Ocorreu uma falha na execução: ${data.error || 'Erro desconhecido'}`]);
        setStatus('error');
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `[ERRO] Conexão perdida com o motor: ${err.message}`]);
      setStatus('error');
    } finally {
      setRunning(false);
      loadRecentSessions();
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
            🤖 Painel de Automação UpSeller
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Mapeamento de SKUs, detecção de kits e automação de anúncios pendentes.
          </p>
        </div>

        {/* Client Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CLIENTE ATIVO</label>
          {clients.length > 0 ? (
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
          ) : (
            <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>Nenhum cliente cadastrado.</span>
          )}
        </div>
      </header>

      {/* Navegação Interna da Automação */}
      <nav style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #334155', marginBottom: '2rem', paddingBottom: '0.5rem' }}>
        <Link href="/automacao" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          📊 Painel
        </Link>
        <Link href="/automacao/mapeamento" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          🔗 Anúncios e Mapeamento
        </Link>
        <Link href="/automacao/produtos" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          📦 Base de Produtos (Truth)
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {/* Grid Superior: Painel de Controle e Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Controle e Execução */}
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Execução do RPA de Conciliação</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Inicia a varredura no UpSeller, busca anúncios não mapeados e realiza a reconciliação visual de SKUs simples e compostos.
            </p>
          </div>
          <button
            onClick={handleStartAutomation}
            disabled={running || !selectedClientId}
            className={running ? 'btn-secondary' : 'btn-primary'}
            style={{ minWidth: '180px', padding: '0.75rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: running ? 'not-allowed' : 'pointer' }}
          >
            {running ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px' }} /> Executando...
              </>
            ) : (
              '⚡ Executar RPA Agora'
            )}
          </button>
        </div>

        {/* Card de Status Neon */}
        <div style={{ 
          background: '#131924', 
          border: `1px solid ${status === 'running' ? '#3b82f6' : status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#1f2a3d'}`, 
          boxShadow: status === 'running' ? '0 0 15px rgba(59, 130, 246, 0.15)' : status === 'success' ? '0 0 15px rgba(16, 185, 129, 0.15)' : status === 'error' ? '0 0 15px rgba(239, 68, 68, 0.15)' : 'none',
          borderRadius: '12px', 
          padding: '1.5rem', 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>STATUS DO BOT</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              background: status === 'running' ? '#3b82f6' : status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#64748b',
              animation: status === 'running' ? 'pulse 1.5s infinite' : 'none'
            }} />
            <span style={{ 
              fontWeight: 700, 
              fontSize: '1.25rem', 
              color: status === 'running' ? '#3b82f6' : status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#94a3b8' 
            }}>
              {status === 'running' ? 'EXECUTANDO' : status === 'success' ? 'SUCESSO' : status === 'error' ? 'FALHA' : 'AGUARDANDO'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '8px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Anúncios Varridos</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', marginTop: '0.25rem' }}>{metrics.scraped}</div>
        </div>
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '8px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mapeados Automatizados</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>{metrics.mapped}</div>
        </div>
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '8px', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Kits Criados (Armazém)</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#a855f7', marginTop: '0.25rem' }}>{metrics.kits}</div>
        </div>
        <div style={{ 
          background: '#1c161b', 
          border: metrics.review > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #1f2a3d', 
          borderRadius: '8px', 
          padding: '1.25rem',
          boxShadow: metrics.review > 0 ? '0 0 10px rgba(239, 68, 68, 0.05)' : 'none'
        }}>
          <span style={{ fontSize: '0.85rem', color: metrics.review > 0 ? '#fca5a5' : 'var(--text-secondary)' }}>Necessita Revisão Humana</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: metrics.review > 0 ? '#ef4444' : '#fff', marginTop: '0.25rem' }}>{metrics.review}</div>
        </div>
      </div>

      {/* Terminal de Logs */}
      <div style={{ background: '#090d16', border: '1px solid #1f2a3d', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#131924', padding: '0.75rem 1.25rem', borderBottom: '1px solid #1f2a3d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} />
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
            Console de Execução em Tempo Real
          </span>
          <button 
            onClick={() => setLogs([])}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', hover: { color: '#fff' } } as any}
          >
            Limpar Console
          </button>
        </div>

        <div 
          ref={logTerminalRef}
          style={{ 
            height: '350px', 
            padding: '1rem', 
            fontFamily: 'monospace', 
            fontSize: '0.85rem', 
            overflowY: 'auto', 
            background: '#090d16', 
            color: '#34d399', 
            lineHeight: '1.5' 
          }}
        >
          {logs.map((log, index) => (
            <div key={index} style={{ 
              color: log.includes('[ERRO]') ? '#f87171' : log.includes('[SISTEMA]') ? '#60a5fa' : log.includes('[RPA Driver]') ? '#a78bfa' : '#34d399' 
            }}>
              {log}
            </div>
          ))}
          {running && (
            <div style={{ color: '#94a3b8', animation: 'blink 1s infinite' }}>
              █ Executando operações de tela...
            </div>
          )}
        </div>
      </div>

      {/* Histórico Recente de Execuções */}
      <div style={{ marginTop: '3rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Sessões Recentes</h3>
        {sessions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem' }}>Início</th>
                  <th style={{ padding: '0.75rem' }}>Duração</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Não Mapeados</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Mapeados</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Kits Criados</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Revisões</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const duration = s.ended_at 
                    ? `${Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)}s` 
                    : 'Em andamento';
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.75rem' }}>{new Date(s.started_at).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem' }}>{duration}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          background: s.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : s.status === 'failed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: s.status === 'completed' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#3b82f6'
                        }}>
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{s.scraped_count}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{s.mapped_count}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: '#a855f7' }}>{s.kits_created_count}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', color: s.review_required_count > 0 ? '#ef4444' : '#fff' }}>
                        {s.review_required_count}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Nenhum histórico de sessões anteriores encontrado para este cliente.</p>
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>

    </div>
  );
}
