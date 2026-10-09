-- =====================================================================
-- Dados abertos: obras_geojson() devolve uma FeatureCollection com uma
-- Feature por trecho (LineString com fim, Point sem), só de licenças
-- emitidas e sem dado interno. Anônimo lê pela função.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'gestor.geo@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-0000000000d1', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000d1', true);

do $$
declare op uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Geo S.A.', 'OpGeo', 'operadora', 'op@g.test') returning id into op;

  -- Emitida, com um trecho linear (tem fim) e um pontual (sem fim).
  perform public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','GEO-INTERNO-1','numero','050/2026','tipos_obra',array['vala','poste'],'escopo','Vala e poste',
      'executora_id',op,'protocolo_data','2026-09-01','situacao','deferida','decisao_data','2026-09-02',
      'inicio_previsto','2026-09-10','fim_previsto','2026-12-01'),
    jsonb_build_array(
      jsonb_build_object('logradouro','Rua Linear','bairro','Centro','inicio_lat',-22.895,'inicio_lng',-43.123,'fim_lat',-22.897,'fim_lng',-43.120),
      jsonb_build_object('logradouro','Rua Pontual','inicio_lat',-22.900,'inicio_lng',-43.110)));

  -- Em análise: não entra.
  perform public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','GEO-INTERNO-2','tipos_obra',array['poste'],'escopo','Poste',
      'executora_id',op,'protocolo_data','2026-09-20'),
    jsonb_build_array(jsonb_build_object('logradouro','Rua Oculta','inicio_lat',-22.9,'inicio_lng',-43.1)));
end $$;

reset role;
set local role anon;
do $$
declare g jsonb := public.obras_geojson();
        feats jsonb := g -> 'features';
        tipos text[];
begin
  perform pg_temp.assert(g ->> 'type' = 'FeatureCollection', 'não é FeatureCollection');
  perform pg_temp.assert(jsonb_array_length(feats) = 2, 'deveria ter 2 features (uma por trecho da emitida): ' || jsonb_array_length(feats));

  select array_agg(x ->> 'type') into tipos
    from jsonb_array_elements(feats) e, lateral (select e -> 'geometry' as x) g2;
  perform pg_temp.assert(tipos @> array['LineString','Point'], 'faltou LineString e Point');

  perform pg_temp.assert(
    exists(select 1 from jsonb_array_elements(feats) e
            where e -> 'properties' ->> 'numero' = '050/2026'
              and e -> 'properties' ->> 'executora' = 'OpGeo'
              and e -> 'properties' ->> 'situacao' = 'vigente'),
    'properties da obra emitida erradas');

  -- Coordenada no padrão GeoJSON [lng, lat].
  perform pg_temp.assert(
    exists(select 1 from jsonb_array_elements(feats) e
            where e -> 'geometry' ->> 'type' = 'LineString'
              and e -> 'geometry' -> 'coordinates' -> 0 = '[-43.123, -22.895]'::jsonb),
    'coordenada fora da ordem [lng, lat]');

  -- Nada de dado interno nem da obra não emitida.
  perform pg_temp.assert(g::text not like '%GEO-INTERNO%' and g::text not like '%Rua Oculta%'
                         and g::text not like '%12345678000195%',
    'vazou dado interno ou obra não emitida no GeoJSON');
end $$;

rollback;
