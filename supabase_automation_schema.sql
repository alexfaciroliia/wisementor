-- ====================================================
-- WiseMentor — Tabelas do Sistema de Automação UpSeller
-- Cole e execute estas queries no SQL Editor do seu Supabase
-- ====================================================

-- Habilitar extensão pg_trgm para buscas textuais otimizadas nos títulos de anúncios
create extension if not exists pg_trgm;

-- 1. Base de Produtos (Fonte da Verdade do WiseMentor)
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  description text not null,
  supplier varchar(5) not null, -- Sigla do Fornecedor (ex: GI, PR)
  sku_upseller text not null, -- SKU base unificado do armazém (ex: REVERSE)
  color text[] default '{}', -- Cores disponíveis
  size text[] default '{}', -- Tamanhos disponíveis (ex: P, M, G, GG)
  image_url text, -- URL da foto principal do produto
  image_hash text, -- Hash visual perceptual (pHash/dHash) para busca por imagem
  cost_price numeric(10, 2) default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Garante unicidade do SKU por cliente no armazém
  unique (client_id, sku_upseller)
);

-- Habilitar RLS nos produtos
alter table public.products enable row level security;

-- Políticas de RLS para produtos (Usuários autenticados podem ler e gravar)
create policy "Produtos sao visiveis por qualquer usuario autenticado" on public.products
  for select using (auth.role() = 'authenticated');

create policy "Produtos podem ser inseridos por qualquer usuario autenticado" on public.products
  for insert with check (auth.role() = 'authenticated');

create policy "Produtos podem ser atualizados por qualquer usuario autenticado" on public.products
  for update using (auth.role() = 'authenticated');

create policy "Produtos podem ser deletados por qualquer usuario autenticado" on public.products
  for delete using (auth.role() = 'authenticated');

-- Índices para melhorar a performance das buscas de SKUs e imagem
create index if not exists idx_products_client_sku on public.products(client_id, sku_upseller);
create index if not exists idx_products_image_hash on public.products(image_hash);

-- Trigger para updated_at automático nos produtos
drop trigger if exists trigger_update_products_timestamp on public.products;
create trigger trigger_update_products_timestamp
  before update on public.products
  for each row execute procedure public.handle_update_timestamp();


-- 2. Configurações da Automação (Credenciais UpSeller)
create table if not exists public.automation_settings (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null unique,
  upseller_email text not null,
  upseller_password_encrypted text not null, -- Criptografado na aplicação
  session_cookies jsonb default '{}', -- Cookies de sessão para persistência
  is_active boolean default true,
  run_schedule text, -- Formato cron (ex: '0 2 * * *')
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS em configurações
alter table public.automation_settings enable row level security;

create policy "Configuracoes de automacao sao visiveis por autenticados" on public.automation_settings
  for select using (auth.role() = 'authenticated');

create policy "Configuracoes de automacao podem ser geridas por autenticados" on public.automation_settings
  for all using (auth.role() = 'authenticated');

-- Trigger para updated_at automático em configurações
drop trigger if exists trigger_update_automation_settings_timestamp on public.automation_settings;
create trigger trigger_update_automation_settings_timestamp
  before update on public.automation_settings
  for each row execute procedure public.handle_update_timestamp();


-- 3. Anúncios Coletados dos Marketplaces (Não Mapeados / Mapeados)
create table if not exists public.marketplace_listings (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  marketplace text not null, -- 'mercado_livre', 'shopee', 'shein', etc.
  marketplace_listing_id text not null, -- ID do anúncio no UpSeller/Marketplace
  title text not null,
  image_url text,
  incorrect_sku text, -- SKU incorreto do marketplace
  mapped_sku text, -- SKU correto após mapeamento (simples ou kit)
  status text not null default 'unmapped' check (status in ('unmapped', 'mapped', 'needs_review')),
  detected_type text default 'unknown' check (detected_type in ('simple', 'kit', 'unknown')),
  review_notes text, -- Motivo da necessidade de revisão humana
  last_scraped_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  unique (client_id, marketplace, marketplace_listing_id)
);

-- Habilitar RLS em anúncios
alter table public.marketplace_listings enable row level security;

create policy "Anuncios sao visiveis por autenticados" on public.marketplace_listings
  for select using (auth.role() = 'authenticated');

create policy "Anuncios podem ser inseridos ou atualizados por autenticados" on public.marketplace_listings
  for all using (auth.role() = 'authenticated');

create index if not exists idx_listings_status on public.marketplace_listings(client_id, status);

-- Trigger para updated_at automático em anúncios
drop trigger if exists trigger_update_marketplace_listings_timestamp on public.marketplace_listings;
create trigger trigger_update_marketplace_listings_timestamp
  before update on public.marketplace_listings
  for each row execute procedure public.handle_update_timestamp();


-- 4. Tabela de Kits Cadastrados/Confirmados
create table if not exists public.warehouse_kits (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  kit_sku text not null, -- Ex: KIT2-AN-SAIDA-CALCA FAIXA-Azul Bebe_Bege-M
  title text not null, -- Título do kit
  image_url text, -- Link da imagem do kit
  components jsonb not null, -- Ex: [{"sku": "AN-SAIDA-CALCA FAIXA-Azul Bebe-M", "qty": 1}, ...]
  created_in_upseller boolean default false, -- Se foi cadastrado no armazém do UpSeller via RPA
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  unique (client_id, kit_sku)
);

-- Habilitar RLS nos kits
alter table public.warehouse_kits enable row level security;

create policy "Kits sao visiveis por autenticados" on public.warehouse_kits
  for select using (auth.role() = 'authenticated');

create policy "Kits podem ser geridos por autenticados" on public.warehouse_kits
  for all using (auth.role() = 'authenticated');

-- Trigger para updated_at automático nos kits
drop trigger if exists trigger_update_warehouse_kits_timestamp on public.warehouse_kits;
create trigger trigger_update_warehouse_kits_timestamp
  before update on public.warehouse_kits
  for each row execute procedure public.handle_update_timestamp();


-- 5. Histórico e Logs de Execução do Motor RPA
create table if not exists public.automation_sessions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ended_at timestamp with time zone,
  scraped_count integer default 0,
  mapped_count integer default 0,
  kits_created_count integer default 0,
  review_required_count integer default 0,
  error_message text,
  logs text[] default '{}'::text[] -- Logs cronológicos detalhados
);

-- Habilitar RLS nas sessões de automação
alter table public.automation_sessions enable row level security;

create policy "Sessoes sao visiveis por autenticados" on public.automation_sessions
  for select using (auth.role() = 'authenticated');

create policy "Sessoes podem ser criadas ou geridas por autenticados" on public.automation_sessions
  for all using (auth.role() = 'authenticated');
