-- =====================================================================
-- CADEX — empresa de teste: fica no sistema para testes (emissão de
-- documentos, campos, cadastro), mas não aparece em nenhuma visão pública
-- nem em consulta pública que liste empresas, obras ou licenças.
--
-- empresas.teste: marcador. Só o administrador altera (mesma regra de
-- empresas.ativa). Uma empresa de teste não sai do banco; o que a
-- consulta pública e as estatísticas deixam de mostrar é tudo que ela
-- executa ou contrata, e a própria empresa.
--
-- Funções refeitas (mesmo corpo, com o filtro acrescentado):
--   obras_publicas, obras_geojson, licenca_publica, consulta_publica,
--   estatisticas_publicas, view comunicacoes_publicas.
-- licenca_publica_historico segue a licença: se a licença não aparece,
-- a trilha também não é lida.
--
-- Exportações (Diário Oficial, relação de empresas) filtram o mesmo
-- marcador no aplicativo (src/lib/exportar.ts e diarioOficial.ts).
--
-- Reversão: teste = false na empresa e recriar as funções sem o filtro
-- (versões de 20261106120000, 20261029130000, 20261123120000 e 20261121120000).
-- =====================================================================

alter table public.empresas add column if not exists teste boolean not null default false;

create or replace function public.empresas_protege_teste()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.teste is distinct from old.teste and auth.uid() is not null and not public.is_administrador() then
    raise exception 'Só administrador marca ou desmarca uma empresa de teste.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.empresas_protege_teste() from public, anon, authenticated;

drop trigger if exists empresas_protege_teste on public.empresas;
create trigger empresas_protege_teste
  before update on public.empresas
  for each row execute function public.empresas_protege_teste();

-- Empresa de teste de homologação, já cadastrada em produção.
update public.empresas set teste = true where codigo_cadex = 'CADEX-TER-2026-0013';

-- Licença que envolve empresa de teste (executora ou contratante) não é
-- pública. A situação da empresa (deferida ou apta) vale para a consulta
-- de empresas, não para as licenças.
create or replace function public.licenca_do_publico(l public.licencas)
returns boolean language sql stable
set search_path = public as $$
  select not exists (
    select 1 from public.empresas x
     where x.teste and x.id in (l.executora_id, l.contratante_id));
$$;

revoke execute on function public.licenca_do_publico(public.licencas) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Mapa e dados abertos
-- ---------------------------------------------------------------------
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
      'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
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
   where l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
     and public.licenca_do_publico(l);
$$;

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
          'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
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
       and public.licenca_do_publico(l)
  ) f;
$$;

-- ---------------------------------------------------------------------
-- Página pública da licença
-- ---------------------------------------------------------------------
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
    'situacao', public.situacao_publica(l, hoje.d, exists (select 1 from public.licenca_suspensoes s where s.licenca_id = l.id and s.fim is null)),
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
     and l.situacao in ('deferida', 'cancelada') and l.excluida_em is null
     and public.licenca_do_publico(l);
$$;

-- ---------------------------------------------------------------------
-- Consulta pública de empresas: não lista a empresa de teste, nem a
-- contratante de teste na lista de contratantes de outra empresa.
-- ---------------------------------------------------------------------
create or replace function public.consulta_publica()
returns table (codigo_cadex text, razao_social text, nome_fantasia text, cnpj text, tipo text, setores text[], situacao text, validade_ate date, portaria_numero text, portaria_data date, contratantes text[], logo_arquivo text)
language sql
stable security definer
set search_path = public
as $function$
  select e.codigo_cadex, e.razao_social, e.nome_fantasia, e.cnpj, e.tipo, e.setores,
         public.situacao_efetiva(e.situacao, e.validade_ate),
         e.validade_ate, e.portaria_numero, e.portaria_data,
         coalesce((
           select array_agg(nome order by nome) from (
             select coalesce(nullif(btrim(c.nome_fantasia), ''), c.razao_social) as nome
               from public.vinculos v join public.empresas c on c.id = v.contratante_id and not c.teste
              where v.contratada_id = e.id and v.fim is null
             union all
             select coalesce(o.sigla, o.nome) as nome
               from public.vinculos v join public.orgaos_publicos o on o.id = v.orgao_contratante_id
              where v.contratada_id = e.id and v.fim is null
           ) nomes
         ), '{}'),
         e.logo_arquivo
    from public.empresas e
   where e.ativa and not e.teste
     and public.situacao_efetiva(e.situacao, e.validade_ate) in ('deferida', 'apta')
   order by e.razao_social;
$function$;

-- ---------------------------------------------------------------------
-- Números públicos (versão 2, com o filtro de empresa de teste)
-- ---------------------------------------------------------------------
create or replace function public.estatisticas_publicas()
returns jsonb language sql stable security definer
set search_path = public, extensions as $$
  with obras as (
    select o from jsonb_array_elements(public.obras_publicas()) as o
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select jsonb_build_object(
    'autorizadas_12m', (select count(*) from public.licencas l, hoje
                         where l.situacao = 'deferida' and l.excluida_em is null
                           and public.licenca_do_publico(l)
                           and l.protocolo_data >= hoje.d - 365 and l.protocolo_data <= hoje.d),
    'concluidas_5a', (select count(*) from public.licencas l, hoje
                       where l.situacao = 'deferida' and l.excluida_em is null
                         and public.licenca_do_publico(l)
                         and l.concluida_em >= hoje.d - interval '5 years' and l.concluida_em <= hoje.d),
    'executoras', (select count(distinct o->>'executora') from obras where coalesce(o->>'executora', '') <> ''),
    'empresas_ativas', (select count(*) from public.empresas where ativa and not teste)
  );
$$;

revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Comunicações ao CISP: empresa de teste não aparece no mapa público.
-- ---------------------------------------------------------------------
create or replace view public.comunicacoes_publicas with (security_barrier = true) as
select
  c.id,
  c.tipo,
  e.razao_social,
  e.codigo_cadex,
  c.tipo_servico,
  c.descricao,
  c.local_servico,
  c.placas,
  c.inicio_lat, c.inicio_lng, c.fim_lat, c.fim_lng,
  c.ocorrido_em,
  c.inicio_previsto,
  c.fim_previsto,
  c.comunicado_em
from public.comunicacoes_servico c
join public.empresas e on e.id = c.empresa_id and not e.teste
     and public.situacao_efetiva(e.situacao, e.validade_ate) in ('deferida', 'apta')
where (c.tipo = 'programado'
         and c.fim_previsto >= public.hoje_niteroi()
         and c.inicio_previsto <= public.hoje_niteroi() + 15)
   or (c.tipo = 'emergencia'
         and c.fim_previsto >= public.hoje_niteroi() - 15
         and c.inicio_previsto <= public.hoje_niteroi());

grant select on public.comunicacoes_publicas to anon, authenticated;
