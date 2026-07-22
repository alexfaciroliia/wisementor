-- ====================================================
-- WiseMentor — Schema Completo do Sistema de Automação & SKUs
-- Executar no SQL Editor do Supabase
-- ====================================================

-- Habilitar extensão pg_trgm para buscas de texto
create extension if not exists pg_trgm;

-- 1. Base de Produtos do Armazém (Fonte da Verdade - Planilha 1)
create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  spu text not null,
  sku text not null,
  product_name text not null,
  supplier text,
  reference_model text,
  color text not null,
  size text not null,
  image_url text,
  cost_price numeric(10, 2) default 0.00,
  is_kit_native boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Garante unicidade do SKU por cliente no armazém
  unique (client_id, sku)
);

alter table public.products enable row level security;

create policy "Produtos sao visiveis por qualquer usuario autenticado" on public.products
  for select using (auth.role() = 'authenticated');

create policy "Produtos podem ser inseridos por qualquer usuario autenticado" on public.products
  for insert with check (auth.role() = 'authenticated');

create policy "Produtos podem ser atualizados por qualquer usuario autenticado" on public.products
  for update using (auth.role() = 'authenticated');

create policy "Produtos podem ser deletados por qualquer usuario autenticado" on public.products
  for delete using (auth.role() = 'authenticated');

create index if not exists idx_products_client_spu on public.products(client_id, spu);
create index if not exists idx_products_client_sku on public.products(client_id, sku);

-- Trigger de updated_at para produtos
drop trigger if exists trigger_update_products_timestamp on public.products;
create trigger trigger_update_products_timestamp
  before update on public.products
  for each row execute procedure public.handle_update_timestamp();


-- 2. Parametrização por Cliente (Termos de Kits e Exceções/Conjuntos)
create table if not exists public.client_parameters (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null unique,
  kit_keywords text[] default '{"kit", "+", "pack", "combo", "jogo"}'::text[],
  ignore_keywords text[] default '{"conjunto"}'::text[],
  auto_standardize_simples boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.client_parameters enable row level security;

create policy "Parametros sao visiveis por autenticados" on public.client_parameters
  for select using (auth.role() = 'authenticated');

create policy "Parametros podem ser geridos por autenticados" on public.client_parameters
  for all using (auth.role() = 'authenticated');

drop trigger if exists trigger_update_client_parameters_timestamp on public.client_parameters;
create trigger trigger_update_client_parameters_timestamp
  before update on public.client_parameters
  for each row execute procedure public.handle_update_timestamp();


-- 3. Anúncios dos Marketplaces (Prompt 2)
create table if not exists public.marketplace_listings (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  marketplace text not null default 'mercado_livre',
  listing_id text not null,
  title text not null,
  clean_title text,
  status_marketplace text not null default 'ativo',
  listing_status text not null default 'pending' check (listing_status in ('pending', 'standardized', 'ignored_conjunto', 'ambiguous_error', 'blocked_error')),
  detected_type text not null default 'unknown' check (detected_type in ('simple', 'kit', 'conjunto', 'unknown')),
  kit_sku text,
  components jsonb default '[]'::jsonb,
  image_url text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.marketplace_listings enable row level security;

create policy "Anuncios sao visiveis por autenticados" on public.marketplace_listings
  for select using (auth.role() = 'authenticated');

create policy "Anuncios podem ser inseridos ou atualizados por autenticados" on public.marketplace_listings
  for all using (auth.role() = 'authenticated');

create index if not exists idx_listings_status on public.marketplace_listings(client_id, listing_status);

drop trigger if exists trigger_update_marketplace_listings_timestamp on public.marketplace_listings;
create trigger trigger_update_marketplace_listings_timestamp
  before update on public.marketplace_listings
  for each row execute procedure public.handle_update_timestamp();


-- 4. Tabela de Logs de Erros & Auditoria (Para exibição no painel e na aba Erros)
create table if not exists public.processing_error_logs (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.clients(id) on delete cascade not null,
  batch_id uuid default gen_random_uuid(),
  stage text not null check (stage in ('planilha_1_produtos', 'planilha_marketplace')),
  severity text not null check (severity in ('warning', 'blocking_error')),
  source_row integer,
  item_identifier text,
  affected_field text,
  original_value text,
  corrected_value text,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.processing_error_logs enable row level security;

create policy "Logs de erro sao visiveis por autenticados" on public.processing_error_logs
  for select using (auth.role() = 'authenticated');

create policy "Logs de erro podem ser geridos por autenticados" on public.processing_error_logs
  for all using (auth.role() = 'authenticated');
