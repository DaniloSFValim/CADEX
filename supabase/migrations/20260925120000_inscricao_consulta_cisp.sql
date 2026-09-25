-- =====================================================================
-- CADEX — situação da inscrição, consulta pública, perfil CISP e
--         identificação de pessoal e veículos
--
-- Resolução Conjunta SECONSER/SEOP nº 001/2026:
--   art. 6º, II  responsável técnico (registro no conselho, ART/RRT)
--   art. 7º      decisão, validade de 12 meses e publicação da relação
--                das empresas com CADEX ativo (§ 2º)
--   art. 8º      notificação, 30 dias de saneamento, inapta, restabelecimento
--   art. 19, §1º tipo e placa do veículo; identificação do responsável
--   art. 21      identificação visual do veículo ou maquinário
--   art. 23      crachá: nome, documento oficial, função, validade
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfis: gestor (SECONSER, cadastra e edita) e cisp (só consulta)
-- ---------------------------------------------------------------------
alter table public.servidores
  add column papel text not null default 'gestor' check (papel in ('gestor', 'cisp'));

create or replace function public.is_gestor()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.servidores where user_id = auth.uid() and papel = 'gestor');
$$;

revoke execute on function public.is_gestor() from public, anon;
grant  execute on function public.is_gestor() to authenticated;

-- ---------------------------------------------------------------------
-- CPF (responsáveis técnicos)
-- ---------------------------------------------------------------------
create or replace function public.cpf_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; v int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  v := (s * 10) % 11; if v = 10 then v := 0; end if;
  if substr(d, 10, 1)::int <> v then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  v := (s * 10) % 11; if v = 10 then v := 0; end if;
  return substr(d, 11, 1)::int = v;
end;
$$;

-- ---------------------------------------------------------------------
-- Situação da inscrição no CADEX (arts. 7º e 8º)
-- ---------------------------------------------------------------------
alter table public.empresas drop column situacao;

alter table public.empresas
  add column situacao text not null default 'em_analise'
    check (situacao in ('em_analise', 'apta', 'em_saneamento', 'inapta', 'indeferida')),
  add column processo_numero   text,  -- processo administrativo do requerimento (art. 27)
  add column data_requerimento date,  -- início do prazo de decisão (art. 7º, caput)
  add column portaria_numero   text,  -- ato publicado que defere a inscrição
  add column portaria_data     date,  -- data de publicação do ato
  add column validade_ate      date,  -- 12 meses (art. 7º, § 1º)
  add column notificacao_data  date;  -- notificação para saneamento (art. 8º)

-- Regras de cada situação. Quem decide é a SECONSER (perfil gestor); o
-- banco só confere que o registro tem o que a Resolução exige.
create or replace function public.empresas_situacao()
returns trigger language plpgsql as $$
begin
  if new.portaria_numero is not null and btrim(new.portaria_numero) = '' then
    new.portaria_numero := null;
  end if;

  -- Validade de 12 meses a partir da publicação do ato (art. 7º, § 1º).
  -- Termo inicial na publicação: regra pendente de definição administrativa.
  if new.portaria_data is not null
     and (tg_op = 'INSERT' or new.portaria_data is distinct from old.portaria_data) then
    new.validade_ate := (new.portaria_data + interval '12 months')::date;
  end if;

  if tg_op = 'UPDATE' and new.situacao = old.situacao then
    return new;
  end if;

  case new.situacao
    when 'apta' then
      if new.portaria_numero is null or new.portaria_data is null then
        raise exception 'Para APTA, informe o número e a data de publicação da portaria que deferiu a inscrição.';
      end if;
      -- Restabelecimento após saneamento (art. 8º, § 3º) encerra a notificação.
      new.notificacao_data := null;

    when 'em_saneamento' then
      if tg_op = 'INSERT' or old.situacao not in ('apta', 'em_saneamento') then
        raise exception 'Só uma empresa APTA pode ser notificada para saneamento (art. 8º).';
      end if;
      if new.notificacao_data is null then
        raise exception 'Informe a data da notificação para saneamento (art. 8º).';
      end if;

    when 'inapta' then
      if tg_op = 'INSERT' or old.situacao <> 'em_saneamento' or new.notificacao_data is null then
        raise exception 'A inaptidão exige notificação prévia para saneamento (art. 8º, caput e § 1º).';
      end if;
      if current_date < new.notificacao_data + 30 then
        raise exception 'O prazo de 30 dias para saneamento só termina em % (art. 8º, § 1º).',
          to_char(new.notificacao_data + 30, 'DD/MM/YYYY');
      end if;

    when 'indeferida' then
      if tg_op = 'UPDATE' and old.situacao <> 'em_analise' then
        raise exception 'Só um requerimento EM ANÁLISE pode ser indeferido (art. 7º).';
      end if;

    else null;
  end case;

  return new;
end;
$$;

create trigger empresas_situacao
  before insert or update on public.empresas
  for each row execute function public.empresas_situacao();

-- A inscrição deferida e ainda no prazo de validade é a "ativa" do art. 3º.
-- Passado o prazo sem nova portaria, a situação exibida é VENCIDA: a
-- Resolução não nomeia esse estado nem diz se ele passa pelo rito do
-- art. 8º — regra pendente de definição administrativa.
create or replace function public.situacao_efetiva(p_situacao text, p_validade date)
returns text language sql stable as $$
  select case
    when p_situacao in ('apta', 'em_saneamento') and p_validade < current_date then 'vencida'
    else p_situacao end;
$$;

-- Histórico de situações: quem mudou, quando, de onde para onde.
create table public.historico_situacao (
  id         uuid primary key default extensions.gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  de         text,
  para       text not null,
  portaria_numero text,
  portaria_data   date,
  em         timestamptz not null default now(),
  por        uuid references auth.users(id) on delete set null
);

create index historico_situacao_empresa_idx on public.historico_situacao (empresa_id, em desc);

create or replace function public.registrar_historico_situacao()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.situacao is distinct from old.situacao
     or new.portaria_numero is distinct from old.portaria_numero
     or new.portaria_data is distinct from old.portaria_data then
    insert into public.historico_situacao (empresa_id, de, para, portaria_numero, portaria_data, por)
    values (new.id, case when tg_op = 'UPDATE' then old.situacao end, new.situacao,
            new.portaria_numero, new.portaria_data, auth.uid());
  end if;
  return new;
end;
$$;

create trigger empresas_historico
  after insert or update on public.empresas
  for each row execute function public.registrar_historico_situacao();

-- ---------------------------------------------------------------------
-- Responsáveis técnicos (art. 6º, II, "a" e "b")
-- ---------------------------------------------------------------------
create table public.responsaveis_tecnicos (
  id              uuid primary key default extensions.gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  nome            text not null check (btrim(nome) <> ''),
  cpf             text not null check (cpf ~ '^\d{11}$' and public.cpf_valido(cpf)),
  conselho        text not null check (btrim(conselho) <> ''),   -- CREA, CFT, CAU…
  registro_numero text not null check (btrim(registro_numero) <> ''),
  registro_uf     char(2),
  art_rrt_numero  text,                                         -- ART/RRT de cargo ou função
  telefone        text,
  email           text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  unique (empresa_id, cpf)
);

-- ---------------------------------------------------------------------
-- Pessoal técnico e crachá (arts. 6º, II, "c", 23 e 25)
-- ---------------------------------------------------------------------
create table public.funcionarios (
  id                 uuid primary key default extensions.gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nome               text not null check (btrim(nome) <> ''),
  documento_tipo     text not null check (documento_tipo in ('CPF', 'RG', 'CNH', 'Outro')),
  documento_numero   text not null check (btrim(documento_numero) <> ''),
  funcao             text not null check (btrim(funcao) <> ''),
  cracha_validade    date,
  telefone           text,
  responsavel_equipe boolean not null default false,  -- art. 25, § 1º
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  unique (empresa_id, documento_tipo, documento_numero)
);

-- ---------------------------------------------------------------------
-- Veículos e maquinário (arts. 19, § 1º, e 21)
-- ---------------------------------------------------------------------
create table public.veiculos (
  id                        uuid primary key default extensions.gen_random_uuid(),
  empresa_id                uuid not null references public.empresas(id) on delete cascade,
  categoria                 text not null default 'veiculo' check (categoria in ('veiculo', 'maquinario')),
  tipo                      text not null check (btrim(tipo) <> ''),  -- ex.: caminhão cesto aéreo
  placa                     text unique,
  modelo                    text,
  identificacao_laterais    boolean not null default false,  -- nome da empresa nas duas laterais
  identificacao_traseira    boolean not null default false,  -- nome da concessionária na traseira
  concessionaria_traseira_id uuid references public.empresas(id) on delete set null,
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now(),
  check (categoria = 'maquinario' or placa is not null)
);

create or replace function public.veiculos_antes_de_gravar()
returns trigger language plpgsql as $$
begin
  new.placa := nullif(upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  -- Placa antiga (ABC1234) ou Mercosul (ABC1D23).
  if new.placa is not null and new.placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida: %', new.placa;
  end if;
  if new.concessionaria_traseira_id is not null and not exists (
       select 1 from public.empresas where id = new.concessionaria_traseira_id and tipo = 'operadora') then
    raise exception 'A concessionária indicada na traseira precisa estar cadastrada como operadora.';
  end if;
  return new;
end;
$$;

create trigger veiculos_antes_de_gravar
  before insert or update on public.veiculos
  for each row execute function public.veiculos_antes_de_gravar();

-- ---------------------------------------------------------------------
-- Acesso
--   gestor: lê e grava tudo
--   cisp:   lê empresas, vínculos, situação, responsáveis, pessoal e
--           veículos; não vê documentos (dados pessoais de sócios etc.)
--   público: só a consulta_publica()
-- ---------------------------------------------------------------------
alter table public.historico_situacao    enable row level security;
alter table public.responsaveis_tecnicos enable row level security;
alter table public.funcionarios          enable row level security;
alter table public.veiculos              enable row level security;

revoke all on public.historico_situacao, public.responsaveis_tecnicos,
              public.funcionarios, public.veiculos from anon;
revoke insert, update, delete on public.historico_situacao from authenticated;

drop policy empresas_servidor on public.empresas;
create policy empresas_ler on public.empresas for select to authenticated using (public.is_servidor());
create policy empresas_gravar on public.empresas for insert to authenticated with check (public.is_gestor());
create policy empresas_alterar on public.empresas for update to authenticated
  using (public.is_gestor()) with check (public.is_gestor());
create policy empresas_excluir on public.empresas for delete to authenticated using (public.is_gestor());

drop policy vinculos_servidor on public.vinculos;
create policy vinculos_ler on public.vinculos for select to authenticated using (public.is_servidor());
create policy vinculos_gravar on public.vinculos for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

drop policy documentos_servidor on public.documentos;
create policy documentos_gestor on public.documentos for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

create policy historico_ler on public.historico_situacao for select to authenticated using (public.is_servidor());

create policy responsaveis_ler on public.responsaveis_tecnicos for select to authenticated using (public.is_servidor());
create policy responsaveis_gravar on public.responsaveis_tecnicos for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

create policy funcionarios_ler on public.funcionarios for select to authenticated using (public.is_servidor());
create policy funcionarios_gravar on public.funcionarios for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

create policy veiculos_ler on public.veiculos for select to authenticated using (public.is_servidor());
create policy veiculos_gravar on public.veiculos for all to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;
  execute 'drop policy if exists documentos_servidor on storage.objects';
  execute $p$
    create policy documentos_gestor on storage.objects for all to authenticated
      using (bucket_id = 'documentos' and public.is_gestor())
      with check (bucket_id = 'documentos' and public.is_gestor())
  $p$;
end $$;

-- ---------------------------------------------------------------------
-- Consulta pública (art. 7º, § 2º)
-- Só dados da pessoa jurídica e da inscrição: nada de contatos,
-- endereço, pessoas ou documentos.
-- ---------------------------------------------------------------------
create or replace function public.consulta_publica()
returns table (
  codigo_cadex    text,
  razao_social    text,
  nome_fantasia   text,
  cnpj            text,
  tipo            text,
  situacao        text,
  validade_ate    date,
  portaria_numero text,
  portaria_data   date,
  operadoras      text[]
)
language sql stable security definer
set search_path = public as $$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((select array_agg(coalesce(nullif(btrim(o.nome_fantasia), ''), o.razao_social)
                                    order by o.razao_social)
                     from public.vinculos v join public.empresas o on o.id = v.operadora_id
                    where v.terceirizada_id = e.id and v.fim is null), '{}')
    from public.empresas e
   order by e.razao_social;
$$;

revoke execute on function public.consulta_publica() from public;
grant  execute on function public.consulta_publica() to anon, authenticated;
