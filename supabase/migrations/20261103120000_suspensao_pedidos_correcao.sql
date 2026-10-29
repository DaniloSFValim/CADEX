-- =====================================================================
-- Suspensão a pedido, pedidos de correção e a situação "suspensa".
--
-- Regra de negócio (confirmada com a SECONSER):
--   - a licença só é prorrogada, suspensa a pedido ou cancelada;
--   - suspensão tem início e fim e motivo; os dias suspensos não contam na
--     validade: ao retomar, a validade é estendida pelo período;
--   - enquanto suspensa, a obra não aparece como vigente no mapa público;
--   - órgão público (registro, sem prazo) não se suspende.
-- Pedido de correção não muda a situação: é um registro de pendência aberta.
-- =====================================================================

create table if not exists public.licenca_suspensoes (
  id          uuid primary key default gen_random_uuid(),
  licenca_id  uuid not null references public.licencas(id) on delete cascade,
  inicio      date not null,
  fim         date,
  motivo      text not null check (length(btrim(motivo)) between 3 and 500),
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create unique index if not exists licenca_suspensao_ativa on public.licenca_suspensoes (licenca_id) where fim is null;
alter table public.licenca_suspensoes enable row level security;
create policy licenca_suspensoes_ler on public.licenca_suspensoes for select to authenticated using (public.is_servidor());

create table if not exists public.licenca_pedidos_correcao (
  id           uuid primary key default gen_random_uuid(),
  licenca_id   uuid not null references public.licencas(id) on delete cascade,
  motivo       text not null check (length(btrim(motivo)) between 3 and 500),
  pedido_por   uuid default auth.uid(),
  pedido_em    timestamptz not null default now(),
  resolucao    text check (resolucao is null or length(btrim(resolucao)) between 3 and 500),
  resolvido_em timestamptz,
  resolvido_por uuid,
  check ((resolvido_em is null) = (resolucao is null))
);
create index if not exists licenca_pedidos_correcao_aberto on public.licenca_pedidos_correcao (licenca_id) where resolvido_em is null;
alter table public.licenca_pedidos_correcao enable row level security;
create policy licenca_pedidos_correcao_ler on public.licenca_pedidos_correcao for select to authenticated using (public.is_servidor());

create trigger zz_auditoria after insert or update on public.licenca_suspensoes
  for each row execute function public.registrar_auditoria();
create trigger zz_auditoria after insert or update on public.licenca_pedidos_correcao
  for each row execute function public.registrar_auditoria();

-- Suspender: gestor ou licenciador; licença deferida, não concluída, não órgão público.
create or replace function public.suspender_licenca(p_id uuid, p_inicio date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_licenca record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para suspender licenças.';
  end if;
  select orgao_contratante_id, situacao, concluida_em, inicio_previsto into v_licenca
    from public.licencas where id = p_id and excluida_em is null;
  if not found then raise exception 'Licença não encontrada.'; end if;
  if v_licenca.orgao_contratante_id is not null then
    raise exception 'Licença de órgão público é registro, sem prazo: não se suspende.';
  end if;
  if v_licenca.situacao <> 'deferida' or v_licenca.concluida_em is not null then
    raise exception 'Só se suspende licença deferida e ainda não concluída.';
  end if;
  if p_inicio > v_hoje or p_inicio < v_licenca.inicio_previsto then
    raise exception 'O início da suspensão precisa estar entre o início da obra ou serviço e hoje.';
  end if;
  insert into public.licenca_suspensoes (licenca_id, inicio, motivo) values (p_id, p_inicio, btrim(p_motivo));
end $$;

-- Retomar: fecha a suspensão ativa e estende a validade pelos dias suspensos (inclusive).
create or replace function public.retomar_licenca(p_id uuid, p_fim date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sus record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para retomar licenças.';
  end if;
  select id, inicio into v_sus from public.licenca_suspensoes where licenca_id = p_id and fim is null;
  if not found then raise exception 'Esta licença não está suspensa.'; end if;
  if p_fim < v_sus.inicio or p_fim > v_hoje then
    raise exception 'A data de retomada precisa estar entre o início da suspensão e hoje.';
  end if;
  update public.licenca_suspensoes set fim = p_fim where id = v_sus.id;
  update public.licencas set validade_ate = validade_ate + (p_fim - v_sus.inicio + 1)
   where id = p_id and validade_ate is not null;
end $$;

-- Pedido de correção: registra a pendência aberta, sem mudar a situação.
create or replace function public.pedir_correcao(p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para pedir correção.';
  end if;
  if not exists (select 1 from public.licencas where id = p_id and excluida_em is null) then
    raise exception 'Licença não encontrada.';
  end if;
  insert into public.licenca_pedidos_correcao (licenca_id, motivo) values (p_id, btrim(p_motivo))
    returning id into v_id;
  return v_id;
end $$;

-- Resolver: fecha o pedido com a resposta de quem corrigiu.
create or replace function public.resolver_correcao(p_pedido uuid, p_resolucao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_gestor() or public.is_licenciador()) then
    raise exception 'Sem permissão para resolver pedidos de correção.';
  end if;
  update public.licenca_pedidos_correcao
     set resolucao = btrim(p_resolucao), resolvido_em = now(), resolvido_por = auth.uid()
   where id = p_pedido and resolvido_em is null;
  if not found then raise exception 'Pedido não encontrado ou já resolvido.'; end if;
end $$;

revoke execute on function public.suspender_licenca(uuid, date, text) from public, anon;
revoke execute on function public.retomar_licenca(uuid, date) from public, anon;
revoke execute on function public.pedir_correcao(uuid, text) from public, anon;
revoke execute on function public.resolver_correcao(uuid, text) from public, anon;
grant  execute on function public.suspender_licenca(uuid, date, text) to authenticated;
grant  execute on function public.retomar_licenca(uuid, date) to authenticated;
grant  execute on function public.pedir_correcao(uuid, text) to authenticated;
grant  execute on function public.resolver_correcao(uuid, text) to authenticated;

-- Situação "suspensa" nas funções públicas (demais ramos inalterados).

create or replace function public.obras_geojson()
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(f.feature order by f.fim_previsto desc nulls last, f.ordem), '[]'::jsonb)
  )
  from (
    select l.fim_previsto, t.ordem,
      jsonb_build_object(
        'type', 'Feature',
        'geometry', case
          when t.fim_lat is null or t.fim_lng is null
            then jsonb_build_object('type', 'Point',
                   'coordinates', jsonb_build_array(t.inicio_lng, t.inicio_lat))
          else jsonb_build_object('type', 'LineString',
                 'coordinates', jsonb_build_array(
                   jsonb_build_array(t.inicio_lng, t.inicio_lat),
                   jsonb_build_array(t.fim_lng, t.fim_lat))) end,
        'properties', jsonb_build_object(
          'codigo', l.codigo_publico,
          'setor', l.setor,
          'tipo_intervencao', l.tipo_intervencao,
          'origem', l.origem_intervencao,
          'numero', l.numero,
          'tipos_obra', l.tipos_obra,
          'escopo', l.escopo,
          'situacao', case
            when l.situacao = 'cancelada' then 'cancelada'
            when l.concluida_em is not null then 'concluida'
            when exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null) then 'suspensa'
            when hoje.d < l.inicio_previsto then 'aguardando_inicio'
            when hoje.d > l.fim_previsto then 'prazo_encerrado'
            else 'vigente' end,
          'inicio_previsto', l.inicio_previsto,
          'fim_previsto', l.fim_previsto,
                    'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
          'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                                  nullif(btrim(og.sigla), ''), og.nome,
                                  case when l.contratante_cpf is null then l.contratante_razao_social end),
          'logradouro', t.logradouro,
          'bairro', t.bairro)
      ) as feature
      from public.licencas l
      cross join hoje
      join public.licenca_trechos t on t.licenca_id = l.id
      left join public.empresas ex on ex.id = l.executora_id
      left join public.empresas co on co.id = l.contratante_id
      left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
     where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
  ) f;
$$;

create or replace function public.obras_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', l.codigo_publico,
      'setor', l.setor,
      'tipo_intervencao', l.tipo_intervencao,
      'origem', l.origem_intervencao,
      'numero', l.numero,
      'tipos_obra', l.tipos_obra,
      'escopo', l.escopo,
      'inicio_previsto', l.inicio_previsto,
      'fim_previsto', l.fim_previsto,
            'validade_ate', l.validade_ate,
      'situacao', case
        when l.situacao = 'cancelada' then 'cancelada'
        when l.concluida_em is not null then 'concluida'
        when exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null) then 'suspensa'
        when l.orgao_contratante_id is not null then 'registro'
        when l.validade_ate is not null and hoje.d > l.validade_ate then 'prazo_encerrado'
        when hoje.d < l.inicio_previsto then 'aguardando_inicio'
        else 'vigente' end,
      'executora', coalesce(nullif(btrim(ex.nome_fantasia), ''), ex.razao_social, l.executora_razao_social),
      'contratante', coalesce(nullif(btrim(co.nome_fantasia), ''), co.razao_social,
                              nullif(btrim(og.sigla), ''), og.nome,
                              case when l.contratante_cpf is null then l.contratante_razao_social end),
      'trechos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'logradouro', t.logradouro, 'bairro', t.bairro,
                 'inicio', jsonb_build_array(t.inicio_lng, t.inicio_lat),
                 'fim', case when t.fim_lat is null then null else jsonb_build_array(t.fim_lng, t.fim_lat) end,
                 'area', case when t.area is null then null else ST_AsGeoJSON(t.area)::jsonb end)
               order by t.ordem)
          from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    order by l.fim_previsto desc), '[]'::jsonb)
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
$$;

create or replace function public.licenca_publica(p_codigo text)
returns jsonb language sql stable security definer
set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'numero', l.numero,
    'tipos_obra', l.tipos_obra,
    'escopo', l.escopo,
    'inicio_previsto', l.inicio_previsto,
    'fim_previsto', l.fim_previsto,
    'concluida_em', l.concluida_em,
    'setor', l.setor,
    'tipo_intervencao', l.tipo_intervencao,
    'origem', l.origem_intervencao,
    'imovel_endereco', l.imovel_endereco,
    'anterior_resolucao', l.anterior_resolucao and l.setor = 'telecom',
    'situacao', case
      when l.situacao = 'cancelada' then 'cancelada'
      when l.concluida_em is not null then 'concluida'
      when exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null) then 'suspensa'
      when hoje.d < l.inicio_previsto then 'aguardando_inicio'
      when hoje.d > l.fim_previsto then 'prazo_encerrado'
      else 'vigente' end,
    'hoje', hoje.d,
    'executora', case
      when ex.id is not null then jsonb_build_object(
        'razao_social', ex.razao_social, 'nome_fantasia', ex.nome_fantasia, 'codigo_cadex', ex.codigo_cadex,
        'situacao_cadex', public.situacao_efetiva(ex.situacao, ex.validade_ate))
      else jsonb_build_object('razao_social', l.executora_razao_social, 'nome_fantasia', null,
                              'codigo_cadex', null, 'situacao_cadex', null) end,
    'contratante', case
      when co.id is not null then jsonb_build_object(
        'razao_social', co.razao_social, 'nome_fantasia', co.nome_fantasia, 'codigo_cadex', co.codigo_cadex)
      -- Órgão público contratante: a sigla aparece como "nome fantasia".
      when og.id is not null then jsonb_build_object(
        'razao_social', og.nome, 'nome_fantasia', og.sigla, 'codigo_cadex', null)
      -- Pessoa física (CPF): o nome não é publicado (LGPD).
      when l.contratante_razao_social is not null and l.contratante_cpf is null then jsonb_build_object(
        'razao_social', l.contratante_razao_social, 'nome_fantasia', null, 'codigo_cadex', null) end,
    'trechos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'logradouro', t.logradouro, 'bairro', t.bairro, 'referencia', t.referencia,
               'inicio_lat', t.inicio_lat, 'inicio_lng', t.inicio_lng, 'fim_lat', t.fim_lat, 'fim_lng', t.fim_lng)
             order by t.ordem)
        from public.licenca_trechos t where t.licenca_id = l.id), '[]'::jsonb))
    from public.licencas l
    cross join hoje
    left join public.empresas ex on ex.id = l.executora_id
    left join public.empresas co on co.id = l.contratante_id
    left join public.orgaos_publicos og on og.id = l.orgao_contratante_id
   where l.codigo_publico = lower(btrim(p_codigo))
     and l.situacao in ('deferida', 'cancelada') and l.excluida_em is null;
$$;
