-- ====================================================
-- WiseMentor — Migração para Adição de Campos de Endereço Detalhados
-- Cole e execute estas queries no SQL Editor do seu Supabase
-- se você já tiver criado a tabela de clientes anteriormente.
-- ====================================================

-- Adiciona as colunas detalhadas de endereço
alter table public.clients
  add column if not exists cep text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text; -- UF

-- Remove a coluna antiga 'address' se não for mais necessária (opcional)
-- Descomente a linha abaixo para remover de fato a coluna address:
-- alter table public.clients drop column if exists address;
