-- ====================================================
-- WiseMentor — Migracao para Sistema de Convites (Invite-Only)
-- Cole e execute estas queries no SQL Editor do seu Supabase
-- ====================================================

-- 1. Tabela de Perfis (Profiles)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  role text not null check (role in ('master', 'mentor', 'mentee', 'user')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS (Row Level Security) nos perfis
alter table public.profiles enable row level security;

-- Politicas de Seguranca para Perfis
create policy "Perfis sao visiveis por qualquer usuario autenticado" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Usuarios podem atualizar o seu proprio perfil" on public.profiles
  for update using (auth.uid() = id);

-- 2. Tabela de Convites (Invitations)
create table if not exists public.invitations (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  role text not null check (role in ('mentor', 'mentee', 'user')),
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS nos convites
alter table public.invitations enable row level security;

-- Politicas de Seguranca para Convites (apenas admin/master pode ler e gerenciar)
create policy "Convites sao visiveis apenas para masters" on public.invitations
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'master'
    )
  );

create policy "Convites podem ser inseridos apenas por masters" on public.invitations
  for insert with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'master'
    )
  );

create policy "Convites podem ser alterados apenas por masters" on public.invitations
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'master'
    )
  );

-- 3. Funcao de Trigger para criacao automatica de perfis
create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_role text;
begin
  -- Procura se existe um convite pendente para este email
  select role into assigned_role
  from public.invitations
  where invitations.email = new.email and invitations.status = 'pending'
  limit 1;

  -- Se nao houver convite, busca no metadata ou define 'user'
  if assigned_role is null then
    assigned_role := coalesce(new.raw_user_meta_data->>'role', 'user');
  end if;

  -- Cria o perfil
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    assigned_role
  );

  -- Atualiza o convite se houver
  update public.invitations
  set status = 'accepted'
  where invitations.email = new.email and invitations.status = 'pending';

  return new;
end;
$$ language plpgsql security definer;

-- Cria o gatilho (Trigger) na tabela auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
