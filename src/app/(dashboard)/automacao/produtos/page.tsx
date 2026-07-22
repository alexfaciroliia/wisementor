'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../../layout';
import { DbProduct } from '@/lib/automation/db-sync';

export default function AutomationProducts() {
  const { selectedClient, selectedClientId } = useDashboard();
  const supabase = createClient();

  const [products, setProducts] = useState<DbProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Estado do modal de cadastro manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<DbProduct>>({
    description: '',
    supplier: '',
    sku_upseller: '',
    color: [],
    size: [],
    image_url: '',
    cost_price: 0,
  });

  const [colorInput, setColorInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');

  // Carregar Produtos salvos no Supabase para o cliente ativo
  useEffect(() => {
    if (!selectedClientId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    loadProducts();
  }, [selectedClientId]);

  async function loadProducts() {
    setLoading(true);
    try {
      const response = await fetch(`/api/automacao/products?clientId=${selectedClientId}`);
      const data = await response.json();
      if (response.ok && data.products) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setLoading(false);
    }
  }

  // Cadastrar Produto Manualmente
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) return;

    const colors = colorInput.split(',').map(c => c.trim()).filter(Boolean);
    const sizes = sizeInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    const productPayload = {
      ...newProduct,
      color: colors,
      size: sizes,
      client_id: selectedClientId
    };

    try {
      const response = await fetch('/api/automacao/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          products: [productPayload]
        })
      });

      if (response.ok) {
        setIsModalOpen(false);
        setNewProduct({ description: '', supplier: '', sku_upseller: '', color: [], size: [], image_url: '', cost_price: 0 });
        setColorInput('');
        setSizeInput('');
        loadProducts();
      }
    } catch (err) {
      console.error('Erro ao criar produto:', err);
    }
  }

  // Excluir Produto
  async function handleDeleteProduct(id: string) {
    if (!confirm('Deseja realmente remover este produto da base oficial?')) return;
    try {
      const response = await fetch(`/api/automacao/products?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        loadProducts();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Filtrar produtos na grade
  const filteredProducts = products.filter(p =>
    (p.sku_upseller || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.supplier || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#e2e8f0' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📦 Fonte da Verdade (Produtos WiseMentor)
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Inventário oficial de produtos salvos no armazém do Supabase para o cliente ativo.
          </p>
        </div>

        {/* Cliente Ativo Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>CLIENTE ATIVO</label>
          <div style={{ padding: '0.5rem 1rem', background: '#1e293b', border: '1px solid #38bdf8', color: '#38bdf8', borderRadius: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
            💼 {selectedClient ? selectedClient.name : 'Nenhum selecionado'}
          </div>
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
        <Link href="/automacao/produtos" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          📦 Base de Produtos
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {!selectedClientId ? (
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1.5rem' }}>📦</span>
          <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 600, margin: 0 }}>Nenhum Cliente Selecionado</h3>
          <p style={{ marginTop: '0.75rem', fontSize: '0.95rem', maxWidth: '600px', margin: '0.75rem auto 0', lineHeight: '1.6' }}>
            Por favor, selecione um cliente ativo no menu <strong>CLIENTE ATIVO</strong> no menu lateral para visualizar os produtos cadastrados.
          </p>
        </div>
      ) : (
        <>
          {/* Card Explicativo sobre a Ingestão Oficial de Produtos */}
          <div style={{ background: '#131924', border: '1px solid #0284c7', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#38bdf8', fontWeight: 600 }}>
                💡 Ingestão & Processamento da Planilha 1
              </h3>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: '#cbd5e1' }}>
                O envio e higienização da **Planilha 1 do Cliente** (com masculinização de cores, expansão de tamanhos e modelos UpSeller) é feito na tela oficial <strong>📦 Produtos (Armazém)</strong>.
              </p>
            </div>

            <Link href="/produtos" style={{
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap'
            }}>
              📦 Ir para Produtos (Armazém)
            </Link>
          </div>

          {/* Grade de SKUs Cadastrados */}
          <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Grade de SKUs Cadastrados ({filteredProducts.length})</h3>
              
              <input
                type="text"
                placeholder="Buscar por SKU, Descrição ou Fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '320px', padding: '0.6rem 1rem', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', fontSize: '0.875rem' }}
              />
            </div>

            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span className="spinner" style={{ width: '24px', height: '24px', marginBottom: '0.5rem' }} />
                <p>Carregando produtos do armazém...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Nenhum produto cadastrado para este cliente. Faça o upload da Planilha 1 na tela <strong>Produtos (Armazém)</strong>.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>SKU UpSeller</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Descrição / Produto</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Fornecedor</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Cores</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Tamanhos</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #1f2a3d' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
                          {p.sku_upseller}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>{p.description}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{p.supplier}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {Array.isArray(p.color) ? p.color.join(', ') : p.color}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#fbbf24', fontWeight: 600 }}>
                          {Array.isArray(p.size) ? p.size.join(', ') : p.size}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <button
                            onClick={() => handleDeleteProduct(p.id || '')}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                          >
                            🗑️ Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
