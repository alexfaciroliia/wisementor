'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../../layout';
import { DbListing, DbProduct } from '@/lib/automation/db-sync';
import { buildKitSkuName, sanitizeSkuText } from '@/lib/automation/decision-engine';

export default function AutomationMapping() {
  const { profile } = useDashboard();
  const supabase = createClient();

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [listings, setListings] = useState<DbListing[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'unmapped' | 'mapped' | 'needs_review'>('unmapped');

  // Controle de Modais de Resolução
  const [resolvingListing, setResolvingListing] = useState<DbListing | null>(null);
  
  // Estados para Mapeamento Simples
  const [selectedSimpleSku, setSelectedSimpleSku] = useState('');
  
  // Estados para Mapeamento de Kit
  const [kitComponents, setKitComponents] = useState<{ sku: string; qty: number; color: string; size: string }[]>([
    { sku: '', qty: 1, color: '', size: 'M' }
  ]);
  const [kitTitle, setKitTitle] = useState('');

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

  // 2. Carregar Anúncios e Base de Produtos
  useEffect(() => {
    if (!selectedClientId) return;
    loadListings();
    loadProducts();
  }, [selectedClientId, activeTab]);

  async function loadListings() {
    setLoading(true);
    try {
      const response = await fetch(`/api/automacao/listings?clientId=${selectedClientId}&status=${activeTab}`);
      const data = await response.json();
      if (response.ok && data.listings) {
        setListings(data.listings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    try {
      const response = await fetch(`/api/automacao/products?clientId=${selectedClientId}`);
      const data = await response.json();
      if (response.ok && data.products) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // 3. Confirmar Mapeamento Simples
  async function handleMapSimple() {
    if (!resolvingListing || !selectedSimpleSku) return;

    try {
      const response = await fetch('/api/automacao/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'map_simple',
          clientId: selectedClientId,
          marketplace: resolvingListing.marketplace,
          listingId: resolvingListing.marketplace_listing_id,
          targetSku: selectedSimpleSku
        })
      });

      if (response.ok) {
        setResolvingListing(null);
        setSelectedSimpleSku('');
        loadListings();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // 4. Confirmar Mapeamento de Kit
  async function handleMapKit() {
    if (!resolvingListing || kitComponents.some(c => c.sku === '')) return;

    // Gerar o SKU do Kit a partir dos componentes selecionados
    const firstComp = kitComponents[0];
    const baseProduct = products.find(p => p.sku_upseller === firstComp.sku);
    const supplier = baseProduct?.supplier || 'WM';
    const totalQty = kitComponents.reduce((acc, c) => acc + c.qty, 0);
    const colors = kitComponents.map(c => c.color || 'Unica');
    const size = firstComp.size || 'M';

    // Gerar Kit SKU de acordo com a nomenclatura estrita
    const generatedKitSku = buildKitSkuName(firstComp.sku, totalQty, colors, size);

    // Mapear os componentes com a formatação individual: SKU-COR-TAMANHO
    const formattedComponents = kitComponents.map(comp => {
      const cleanColor = sanitizeSkuText(comp.color || 'Unica');
      const cleanSize = sanitizeSkuText(comp.size || 'U');
      return {
        sku: `${comp.sku}-${cleanColor}-${cleanSize}`,
        qty: comp.qty
      };
    });

    try {
      const response = await fetch('/api/automacao/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_kit_mapping',
          clientId: selectedClientId,
          marketplace: resolvingListing.marketplace,
          listingId: resolvingListing.marketplace_listing_id,
          targetSku: generatedKitSku,
          title: kitTitle || resolvingListing.title,
          imageUrl: resolvingListing.image_url,
          components: formattedComponents
        })
      });

      if (response.ok) {
        setResolvingListing(null);
        setKitComponents([{ sku: '', qty: 1, color: '', size: 'M' }]);
        setKitTitle('');
        loadListings();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // 5. Enviar para Revisão Manual
  async function handleFlagReview(listing: DbListing) {
    try {
      await fetch('/api/automacao/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'flag_review',
          clientId: selectedClientId,
          marketplace: listing.marketplace,
          listingId: listing.marketplace_listing_id,
          notes: 'Encaminhado manualmente pelo operador para revisão detalhada.'
        })
      });
      loadListings();
    } catch (err) {
      console.error(err);
    }
  }

  // Auxiliar para montar opções de componentes
  const uniqueBaseSkuUpsellers = Array.from(new Set(products.map(p => p.sku_upseller)));

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#e2e8f0' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔗 Gerenciador de Mapeamentos
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Acompanhe anúncios não mapeados no marketplace e resolva conflitos do motor RPA.
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
        <Link href="/automacao/mapeamento" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          🔗 Anúncios e Mapeamento
        </Link>
        <Link href="/automacao/produtos" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          📦 Base de Produtos (Truth)
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {!selectedClientId ? (
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1.5rem' }}>🔗</span>
          <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 600, margin: 0 }}>Nenhum Cliente Selecionado</h3>
          <p style={{ marginTop: '0.75rem', fontSize: '0.95rem', maxWidth: '600px', margin: '0.75rem auto 0', lineHeight: '1.6' }}>
            Por favor, selecione um cliente ativo no menu <strong>Cliente Ativo</strong> no canto superior direito para gerenciar ou mapear os anúncios correspondentes no marketplace.
          </p>
        </div>
      ) : (
        <>
          {/* Abas de Status de Anúncios */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => setActiveTab('unmapped')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'unmapped' ? '#1e293b' : 'none',
                color: activeTab === 'unmapped' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'unmapped' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              Não Mapeados ({listings.filter(l => l.status === 'unmapped').length || 0})
            </button>
            
            <button
              onClick={() => setActiveTab('mapped')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'mapped' ? '#1e293b' : 'none',
                color: activeTab === 'mapped' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'mapped' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              Mapeados com Sucesso ({listings.filter(l => l.status === 'mapped').length || 0})
            </button>
            
            <button
              onClick={() => setActiveTab('needs_review')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'needs_review' ? '#1e293b' : 'none',
                color: activeTab === 'needs_review' ? '#ef4444' : 'var(--text-secondary)',
                fontWeight: activeTab === 'needs_review' ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              ⚠️ Necessita Revisão ({listings.filter(l => l.status === 'needs_review').length || 0})
            </button>
          </div>

          {/* Listagem */}
          <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <span className="spinner" style={{ width: '30px', height: '30px' }} />
              </div>
            ) : listings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {listings.map((l, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      background: '#0d1117', 
                      border: '1px solid #1e293b', 
                      borderRadius: '8px', 
                      padding: '1rem' 
                    }}
                  >
                    {/* Imagem e Título */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                      {l.image_url ? (
                        <img 
                          src={l.image_url} 
                          alt="Anúncio" 
                          style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #334155' }} 
                        />
                      ) : (
                        <div style={{ width: '60px', height: '60px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}>📷</div>
                      )}
                      
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          {l.marketplace.replace('_', ' ')}
                        </span>
                        <h4 style={{ margin: '0.35rem 0 0.15rem', fontSize: '0.95rem', fontWeight: 600 }}>{l.title}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          SKU Original: <code style={{ color: '#fca5a5' }}>{l.incorrect_sku || 'Nenhum'}</code> | ID: {l.marketplace_listing_id}
                        </span>
                        
                        {l.status === 'needs_review' && l.review_notes && (
                          <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', padding: '0.4rem', borderLeft: '3px solid #ef4444', borderRadius: '4px' }}>
                            <strong>Motivo da Revisão:</strong> {l.review_notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Métricas e Ações */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '2rem' }}>
                      {l.status === 'mapped' && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Mapeado para:</span>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>{l.mapped_sku}</div>
                        </div>
                      )}

                      {l.status !== 'mapped' && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setResolvingListing(l)}
                            className="btn-primary"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            ⚡ Conciliar
                          </button>

                          {l.status === 'unmapped' && (
                            <button
                              onClick={() => handleFlagReview(l)}
                              className="btn-secondary"
                              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                            >
                              Marcar Revisão
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                Nenhum anúncio encontrado nesta aba para o cliente selecionado.
              </p>
            )}
          </div>

          {/* Modal de Conciliação */}
          {resolvingListing && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: '650px' }}>
                <div className="modal-header">
                  <h3 className="modal-title">Conciliar SKU do Anúncio</h3>
                  <button 
                    onClick={() => {
                      setResolvingListing(null);
                      setKitComponents([{ sku: '', qty: 1, color: '', size: 'M' }]);
                    }} 
                    className="modal-close"
                  >
                    &times;
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0', background: '#0d1117', padding: '1rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <img 
                    src={resolvingListing.image_url} 
                    alt="Original" 
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px' }} 
                  />
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>ANÚNCIO DO MARKETPLACE</span>
                    <h4 style={{ margin: '0.2rem 0', fontSize: '1rem', fontWeight: 600 }}>{resolvingListing.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      SKU Incorreto: <code style={{ color: '#ef4444' }}>{resolvingListing.incorrect_sku}</code>
                    </p>
                  </div>
                </div>

                {/* Abas Internas de Resolução: Produto Simples ou Kit */}
                <div style={{ borderBottom: '1px solid #1e293b', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>Método de Vinculação:</h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  
                  {/* Opção 1: Mapear como Produto Simples */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid #1e293b', padding: '1rem', borderRadius: '8px' }}>
                    <h5 style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#fff' }}>1. Produto Simples</h5>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Se o anúncio contiver apenas 1 produto individual da base.
                    </p>
                    
                    <div className="form-field">
                      <label className="form-label">Selecionar SKU da Base</label>
                      <select
                        value={selectedSimpleSku}
                        onChange={(e) => setSelectedSimpleSku(e.target.value)}
                        className="form-input"
                        style={{ background: '#0d1117', color: '#fff', fontSize: '0.85rem' }}
                      >
                        <option value="">-- Selecione o SKU --</option>
                        {products.map((p, idx) => (
                          <option key={idx} value={p.sku_upseller}>
                            {p.sku_upseller} ({p.description})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleMapSimple}
                      disabled={!selectedSimpleSku}
                      className="btn-primary"
                      style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', marginTop: '1rem' }}
                    >
                      Confirmar Simples
                    </button>
                  </div>

                  {/* Opção 2: Mapear como Kit */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid #1e293b', padding: '1rem', borderRadius: '8px' }}>
                    <h5 style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#a855f7' }}>2. Formar Kit de Produtos</h5>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Associe múltiplos produtos e configure a nomenclatura do Kit.
                    </p>

                    <div className="form-field">
                      <label className="form-label">Título do Kit (Opcional)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: Kit 2 Calças Saída"
                        value={kitTitle}
                        onChange={(e) => setKitTitle(e.target.value)}
                        style={{ background: '#0d1117', color: '#fff', fontSize: '0.85rem', padding: '0.4rem' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem', marginBottom: '1rem' }}>
                      {kitComponents.map((comp, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', background: '#090d16', padding: '0.5rem', borderRadius: '6px' }}>
                          
                          {/* SKU Base Selector */}
                          <div style={{ flex: 2 }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Produto</label>
                            <select
                              value={comp.sku}
                              onChange={(e) => {
                                const newComps = [...kitComponents];
                                newComps[idx].sku = e.target.value;
                                setKitComponents(newComps);
                              }}
                              className="form-input"
                              style={{ background: '#0d1117', color: '#fff', fontSize: '0.8, padding: 0.25rem' }}
                            >
                              <option value="">Produto...</option>
                              {uniqueBaseSkuUpsellers.map((sku, i) => (
                                <option key={i} value={sku}>{sku}</option>
                              ))}
                            </select>
                          </div>

                          {/* Cor */}
                          <div style={{ flex: 1.2 }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Cor</label>
                            <input
                              type="text"
                              placeholder="Azul Bebe"
                              value={comp.color}
                              onChange={(e) => {
                                const newComps = [...kitComponents];
                                newComps[idx].color = e.target.value;
                                setKitComponents(newComps);
                              }}
                              className="form-input"
                              style={{ background: '#0d1117', color: '#fff', fontSize: '0.8rem', padding: '0.25rem' }}
                            />
                          </div>

                          {/* Tamanho */}
                          <div style={{ width: '50px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Tam.</label>
                            <input
                              type="text"
                              placeholder="M"
                              value={comp.size}
                              onChange={(e) => {
                                const newComps = [...kitComponents];
                                newComps[idx].size = e.target.value.toUpperCase();
                                setKitComponents(newComps);
                              }}
                              className="form-input"
                              style={{ background: '#0d1117', color: '#fff', fontSize: '0.8rem', padding: '0.25rem', textAlign: 'center' }}
                            />
                          </div>

                          {/* Quantidade */}
                          <div style={{ width: '50px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Qtd</label>
                            <input
                              type="number"
                              min={1}
                              value={comp.qty}
                              onChange={(e) => {
                                const newComps = [...kitComponents];
                                newComps[idx].qty = Number(e.target.value);
                                setKitComponents(newComps);
                              }}
                              className="form-input"
                              style={{ background: '#0d1117', color: '#fff', fontSize: '0.8rem', padding: '0.25rem', textAlign: 'center' }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (kitComponents.length > 1) {
                                setKitComponents(kitComponents.filter((_, i) => i !== idx));
                              }
                            }}
                            style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '1.1rem', cursor: 'pointer', paddingBottom: '0.25rem' }}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setKitComponents([...kitComponents, { sku: '', qty: 1, color: '', size: 'M' }])}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem' }}
                    >
                      ➕ Adicionar outro produto ao kit
                    </button>

                    <button
                      onClick={handleMapKit}
                      disabled={kitComponents.some(c => c.sku === '')}
                      className="btn-primary"
                      style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', background: '#a855f7', borderColor: '#a855f7' }}
                    >
                      Criar e Associar Kit
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
