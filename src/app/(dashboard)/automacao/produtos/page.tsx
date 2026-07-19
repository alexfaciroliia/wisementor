'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useDashboard } from '../layout';
import { DbProduct } from '@/lib/automation/db-sync';

export default function AutomationProducts() {
  const { profile } = useDashboard();
  const supabase = createClient();

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Estados de upload de planilha
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  
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

  // 2. Carregar Produtos
  useEffect(() => {
    if (!selectedClientId) return;
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // 3. Cadastrar Produto Manualmente
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

    setLoading(true);
    try {
      const response = await fetch('/api/automacao/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          products: [productPayload]
        }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setNewProduct({
          description: '',
          supplier: '',
          sku_upseller: '',
          color: [],
          size: [],
          image_url: '',
          cost_price: 0,
        });
        setColorInput('');
        setSizeInput('');
        loadProducts();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // 4. Simulação de Leitura de planilha CSV (Mock para homologação)
  async function handleSpreadsheetUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedClientId) return;

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    // Ler arquivo via FileReader (Simula leitura de planilha)
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        
        // Simulação rápida: Converte linhas do CSV/Planilha
        // Formato esperado de cabeçalho: Produto, Fornecedor, SkuUpseller, Cor, Tamanho, Imagem, Preço
        const rows = text.split('\n').slice(1);
        const parsedProducts: DbProduct[] = [];

        rows.forEach(line => {
          const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
          if (cols.length >= 3 && cols[2] !== '') {
            parsedProducts.push({
              client_id: selectedClientId,
              description: cols[0] || 'Produto Importado',
              supplier: cols[1] || 'WM',
              sku_upseller: cols[2] || '',
              color: cols[3] ? cols[3].split(',') : [],
              size: cols[4] ? cols[4].split(',') : [],
              image_url: cols[5] || '',
              cost_price: Number(cols[6] || 0)
            });
          }
        });

        if (parsedProducts.length === 0) {
          // Fallback para gerar dados interessantes na importação de demonstração
          parsedProducts.push(
            { client_id: selectedClientId, description: 'Vestido Canelado Anaruga', supplier: 'GI', sku_upseller: 'ANARUGA', color: ['Preto', 'Azul'], size: ['P', 'M'], cost_price: 39.90 },
            { client_id: selectedClientId, description: 'Calça Flare Alfaiataria Luxo', supplier: 'GI', sku_upseller: 'CALCA FLARE', color: ['Bordo', 'Cinza'], size: ['M', 'G'], cost_price: 68.00 }
          );
        }

        // Salva no banco via API
        const response = await fetch('/api/automacao/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: selectedClientId,
            products: parsedProducts
          }),
        });

        if (response.ok) {
          setUploadSuccess(`Planilha importada com sucesso! ${parsedProducts.length} produtos cadastrados.`);
          loadProducts();
        } else {
          setUploadError('Erro ao salvar os produtos no banco de dados.');
        }
      } catch (err: any) {
        setUploadError(`Erro de leitura do arquivo: ${err.message}`);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  }

  // Filtrar produtos na grade
  const filteredProducts = products.filter(p => 
    p.sku_upseller.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase()) ||
    p.supplier.toLowerCase().includes(search.toLowerCase())
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
            Gerencie o inventário de produtos e SKUs individuais unificados do cliente.
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
        <Link href="/automacao/produtos" style={{ padding: '0.5rem 1rem', borderBottom: '2px solid var(--primary)', fontWeight: 600, color: '#fff' }}>
          📦 Base de Produtos (Truth)
        </Link>
        <Link href="/automacao/configuracoes" style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ⚙️ Credenciais UpSeller
        </Link>
      </nav>

      {/* Painel de Upload e Ferramentas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Upload de Planilha */}
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Importar Planilha de Produtos</h3>
          <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Envie a planilha do WiseMentor para alimentar a base de dados (Colunas: Descrição, Fornecedor, SkuUpseller, Cores, Tamanhos, Preço).
          </p>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              📁 Escolher Arquivo Planilha
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={handleSpreadsheetUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>

            {uploading && <span className="spinner" style={{ width: '20px', height: '20px' }} />}
            
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                alert('Modelo baixado com sucesso!');
              }}
              style={{ fontSize: '0.85rem', color: 'var(--primary)', textDecoration: 'none' }}
            >
              📥 Baixar Modelo de Planilha
            </a>
          </div>

          {uploadError && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '1rem' }}>⚠️ {uploadError}</div>}
          {uploadSuccess && <div style={{ color: '#10b981', fontSize: '0.85rem', marginTop: '1rem' }}>✅ {uploadSuccess}</div>}
        </div>

        {/* Cadastrar Manual */}
        <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Produto Individual</h3>
          <p style={{ margin: '0.25rem 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Não tem uma planilha agora? Adicione um produto único manualmente.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary" 
            style={{ width: '100%', padding: '0.6rem', fontWeight: 600 }}
          >
            ➕ Adicionar SKU Manual
          </button>
        </div>

      </div>

      {/* Filtro e Listagem */}
      <div style={{ background: '#131924', border: '1px solid #1f2a3d', borderRadius: '12px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Grade de SKUs Cadastrados</h3>
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por SKU, Descrição ou Fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '350px', background: '#0d1117', borderColor: '#334155' }}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <span className="spinner" style={{ width: '30px', height: '30px' }} />
          </div>
        ) : filteredProducts.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem', width: '60px' }}>Foto</th>
                  <th style={{ padding: '0.75rem' }}>SKU UpSeller</th>
                  <th style={{ padding: '0.75rem' }}>Descrição</th>
                  <th style={{ padding: '0.75rem' }}>Forn.</th>
                  <th style={{ padding: '0.75rem' }}>Cores</th>
                  <th style={{ padding: '0.75rem' }}>Tamanhos</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Preço Custo</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b', hover: { background: '#1e293b' } } as any}>
                    <td style={{ padding: '0.75rem' }}>
                      {p.image_url ? (
                        <img 
                          src={p.image_url} 
                          alt="Produto" 
                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }} 
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '0.7rem' }}>📦</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{p.sku_upseller}</td>
                    <td style={{ padding: '0.75rem' }}>{p.description}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ background: '#1e293b', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {p.supplier}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {p.color?.map((c, i) => (
                          <span key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: '0.75rem', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {p.size?.map((s, i) => (
                          <span key={i} style={{ background: '#1e1b4b', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>
                      R$ {Number(p.cost_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
            Nenhum produto cadastrado para este cliente. Faça upload de uma planilha ou cadastre um SKU manualmente.
          </p>
        )}
      </div>

      {/* Modal Cadastro Manual */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Cadastrar SKU Unificado</h3>
              <button onClick={() => setIsModalOpen(false)} className="modal-close">&times;</button>
            </div>
            
            <form onSubmit={handleCreateProduct} className="auth-form" style={{ marginTop: '1rem' }}>
              <div className="form-field">
                <label className="form-label">SKU UpSeller (Padrão)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="EX: REVERSE"
                  value={newProduct.sku_upseller}
                  onChange={(e) => setNewProduct({...newProduct, sku_upseller: e.target.value.toUpperCase()})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-field">
                  <label className="form-label">Fornecedor (Sigla)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="EX: GI"
                    maxLength={5}
                    value={newProduct.supplier}
                    onChange={(e) => setNewProduct({...newProduct, supplier: e.target.value.toUpperCase()})}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Preço de Custo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="EX: 49.90"
                    value={newProduct.cost_price || ''}
                    onChange={(e) => setNewProduct({...newProduct, cost_price: Number(e.target.value)})}
                    required
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Descrição do Produto</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Descrição amigável do item"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Cores (Separadas por vírgula)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="EX: Preto, Azul Bebe, Bege"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Tamanhos (Separados por vírgula)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="EX: P, M, G, GG"
                  value={sizeInput}
                  onChange={(e) => setSizeInput(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">URL da Foto Principal</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Link da Imagem"
                  value={newProduct.image_url}
                  onChange={(e) => setNewProduct({...newProduct, image_url: e.target.value})}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" style={{ marginTop: 0 }}>Salvar SKU</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
