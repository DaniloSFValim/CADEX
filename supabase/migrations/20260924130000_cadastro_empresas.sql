-- =====================================================================
-- CADEX — cadastro de empresas
--
-- Escopo desta versão: a Prefeitura cadastra as empresas (operadoras de
-- telecomunicações e suas terceirizadas) e guarda a documentação exigida
-- pelo art. 6º da Resolução Conjunta SECONSER/SEOP nº 001/2026.
--
-- Só servidores da Prefeitura (tabela `servidores`) leem ou gravam dados.
-- Nada é público.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Quem pode usar o sistema
-- ---------------------------------------------------------------------
create table public.servidores (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- SECURITY DEFINER: a resposta não pode depender do que a própria RLS de
-- `servidores` deixa o usuário ver.
create or replace function public.is_servidor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid());
$$;

revoke execute on function public.is_servidor() from public, anon;
grant  execute on function public.is_servidor() to authenticated;

-- ---------------------------------------------------------------------
-- CNPJ: só dígitos, com dígito verificador conferido
-- ---------------------------------------------------------------------
create or replace function public.cnpj_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; v int;
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0;
  for i in 1..12 loop s := s + substr(d, i, 1)::int * w1[i]; end loop;
  v := 11 - s % 11; if v >= 10 then v := 0; end if;
  if substr(d, 13, 1)::int <> v then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(d, i, 1)::int * w2[i]; end loop;
  v := 11 - s % 11; if v >= 10 then v := 0; end if;
  return substr(d, 14, 1)::int = v;
end;
$$;

-- ---------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------
create table public.empresas (
  id            uuid primary key default extensions.gen_random_uuid(),
  cnpj          text not null unique check (cnpj ~ '^\d{14}$' and public.cnpj_valido(cnpj)),
  razao_social  text not null check (btrim(razao_social) <> ''),
  nome_fantasia text,
  tipo          text not null check (tipo in ('operadora', 'terceirizada')),
  -- Terceirizada aponta a operadora que a contratou.
  operadora_id  uuid references public.empresas(id) on delete restrict,
  email         text not null check (btrim(email) <> ''),
  telefone      text,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            char(2),
  situacao      text not null default 'ativa' check (situacao in ('ativa', 'inativa')),
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index empresas_operadora_idx on public.empresas (operadora_id);

create or replace function public.empresas_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  new.cnpj := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');
  new.atualizado_em := now();

  if new.tipo = 'terceirizada' then
    if new.operadora_id is null then
      raise exception 'Terceirizada precisa da operadora que a contratou.';
    end if;
    if not exists (select 1 from public.empresas
                    where id = new.operadora_id and tipo = 'operadora') then
      raise exception 'A contratante informada não está cadastrada como operadora.';
    end if;
  else
    new.operadora_id := null;
  end if;

  -- Uma operadora com terceirizadas vinculadas não pode virar terceirizada.
  if tg_op = 'UPDATE' and old.tipo = 'operadora' and new.tipo = 'terceirizada'
     and exists (select 1 from public.empresas where operadora_id = new.id) then
    raise exception 'Esta operadora tem terceirizadas vinculadas; desvincule-as antes.';
  end if;

  return new;
end;
$$;

create trigger empresas_antes_de_gravar
  before insert or update on public.empresas
  for each row execute function public.empresas_antes_de_gravar();

-- ---------------------------------------------------------------------
-- Documentos exigidos para a inscrição no CADEX (art. 6º)
-- ---------------------------------------------------------------------
create table public.tipos_documento (
  codigo       text primary key,
  nome         text not null,
  fundamento   text not null,
  obrigatorio  boolean not null,
  tem_validade boolean not null,
  ordem        int not null
);

-- Incisos IV e V: só se aplicam a quem tem infraestrutura própria ou
-- contrato de compartilhamento. Ficam como não obrigatórios; se a
-- SECONSER exigir declaração negativa de quem não os tem, é regra
-- pendente de definição administrativa.
insert into public.tipos_documento (codigo, nome, fundamento, obrigatorio, tem_validade, ordem) values
  ('CNPJ_CARD',           'Cartão CNPJ',                                                           'Art. 6º, I, "a"',  true,  false, 10),
  ('CONTRATO_SOCIAL',     'Contrato social / estatuto consolidado',                                'Art. 6º, I, "b"',  true,  false, 20),
  ('DOC_SOCIOS',          'Documentos dos sócios administradores / procuradores',                  'Art. 6º, I, "c"',  true,  false, 30),
  ('CND_FEDERAL',         'Certidão negativa federal',                                             'Art. 6º, I, "d"',  true,  true,  40),
  ('CND_ESTADUAL',        'Certidão negativa estadual',                                            'Art. 6º, I, "e"',  true,  true,  50),
  ('CND_MUNICIPAL',       'Certidão negativa municipal',                                           'Art. 6º, I, "f"',  true,  true,  60),
  ('CRF_FGTS',            'CRF / FGTS',                                                            'Art. 6º, I, "g"',  true,  true,  70),
  ('CNDT',                'CNDT — débitos trabalhistas',                                           'Art. 6º, I, "h"',  true,  true,  80),
  ('REG_RT',              'Registro do responsável técnico',                                       'Art. 6º, II, "a"', true,  true,  90),
  ('ART_RRT_CARGO',       'ART/RRT de cargo ou função',                                            'Art. 6º, II, "b"', true,  true,  100),
  ('REL_EQUIPAMENTOS',    'Relação descritiva de equipamentos e do contingente de pessoal técnico','Art. 6º, II, "c"', true,  false, 110),
  ('DECL_REGULADOR',      'Declaração de regularidade perante órgãos reguladores',                 'Art. 6º, III',     true,  false, 120),
  ('MAPA_INFRA',          'Mapa da infraestrutura própria (arquivo digital vetorial georreferenciado)', 'Art. 6º, IV', false, false, 130),
  ('CONTRATO_COMPART',    'Contrato de compartilhamento de infraestrutura',                        'Art. 6º, V',       false, true,  140),
  ('COMPROV_ADIMPLENCIA', 'Comprovante de adimplência das instalações localizadas em Niterói',     'Art. 6º, V',       false, true,  150);

create table public.documentos (
  id           uuid primary key default extensions.gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  tipo         text not null references public.tipos_documento(codigo),
  arquivo      text not null,          -- caminho no Storage: <empresa_id>/<arquivo>
  nome_arquivo text not null,
  validade     date,
  enviado_em   timestamptz not null default now(),
  enviado_por  uuid default auth.uid() references auth.users(id) on delete set null
);

create index documentos_empresa_idx on public.documentos (empresa_id, tipo, enviado_em desc);

-- Documento com validade precisa da data; o arquivo precisa estar na
-- pasta da própria empresa.
create or replace function public.documentos_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  if (select tem_validade from public.tipos_documento where codigo = new.tipo)
     and new.validade is null then
    raise exception 'Informe a data de validade deste documento.';
  end if;
  if split_part(new.arquivo, '/', 1) <> new.empresa_id::text then
    raise exception 'O arquivo precisa estar na pasta da própria empresa.';
  end if;
  return new;
end;
$$;

create trigger documentos_antes_de_gravar
  before insert or update on public.documentos
  for each row execute function public.documentos_antes_de_gravar();

-- ---------------------------------------------------------------------
-- Acesso: só servidores. Nada para o público (anon).
-- ---------------------------------------------------------------------
alter table public.servidores      enable row level security;
alter table public.empresas        enable row level security;
alter table public.tipos_documento enable row level security;
alter table public.documentos      enable row level security;

revoke all on public.servidores, public.empresas, public.tipos_documento, public.documentos from anon;

create policy servidores_propria on public.servidores
  for select to authenticated using (user_id = auth.uid());

create policy empresas_servidor on public.empresas
  for all to authenticated using (public.is_servidor()) with check (public.is_servidor());

create policy tipos_documento_servidor on public.tipos_documento
  for select to authenticated using (public.is_servidor());

create policy documentos_servidor on public.documentos
  for all to authenticated using (public.is_servidor()) with check (public.is_servidor());

-- Quem é servidor é decidido fora do app (SQL Editor): ninguém se promove.
revoke insert, update, delete on public.servidores from authenticated;
revoke insert, update, delete on public.tipos_documento from authenticated;

-- ---------------------------------------------------------------------
-- Arquivos: bucket privado, só servidores. O schema `storage` só existe
-- no Supabase; em Postgres puro (scripts/test-db.sh) este bloco é pulado.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente — bucket não criado (execução fora do Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 26214400,
          array['application/pdf', 'image/jpeg', 'image/png',
                'application/zip', 'application/vnd.google-earth.kml+xml',
                'application/vnd.google-earth.kmz', 'application/geo+json'])
  on conflict (id) do nothing;

  execute $p$
    create policy documentos_servidor on storage.objects for all to authenticated
      using (bucket_id = 'documentos' and public.is_servidor())
      with check (bucket_id = 'documentos' and public.is_servidor())
  $p$;
exception when duplicate_object then
  raise notice 'Política documentos_servidor já existe.';
end $$;
