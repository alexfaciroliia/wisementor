-- ====================================================
-- WiseMentor — Tabela de Clientes
-- Cole e execute estas queries no SQL Editor do seu Supabase
-- ====================================================

-- 1. Criação da tabela de clientes (clients)
create table if not exists public.clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  phone text,
  document text, -- CPF ou CNPJ
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS (Row Level Security) nos clientes
alter table public.clients enable row level security;

-- Políticas de Segurança para Clientes
-- Todos os usuários autenticados (sistema, administrador, operador) podem ler
create policy "Clientes sao visiveis por qualquer usuario autenticado" on public.clients
  for select using (auth.role() = 'authenticated');

-- Todos os usuários autenticados podem inserir
create policy "Clientes podem ser criados por qualquer usuario autenticado" on public.clients
  for insert with check (auth.role() = 'authenticated');

-- Todos os usuários autenticados podem atualizar
create policy "Clientes podem ser atualizados por qualquer usuario autenticado" on public.clients
  for update using (auth.role() = 'authenticated');

-- Apenas usuários nível 'sistema' e 'administrador' podem deletar fisicamente um cliente
create policy "Clientes podem ser deletados por administrador ou sistema" on public.clients
  for delete using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('sistema', 'administrador')
    )
  );

-- Trigger para atualizar a coluna updated_at automaticamente
create or replace function public.handle_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_update_clients_timestamp on public.clients;
create trigger trigger_update_clients_timestamp
  before update on public.clients
  for each row execute procedure public.handle_update_timestamp();
