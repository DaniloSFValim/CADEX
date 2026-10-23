-- =====================================================================
-- Recomposição (garantia) e conflito espaço-temporal entre obras.
--   - obra vigente a ≤15 m com cronograma sobreposto  → tipo 'vigente';
--   - obra concluída a ≤15 m ainda na garantia (24 m) → tipo 'recomposicao';
--   - obra longe (>15 m) ou com garantia vencida       → não aparece;
--   - recomposição exige conclusão e não pode ser anterior a ela.
-- Coordenadas em torno de (-22.8950, -43.1230); ~0,0001° ≈ 10 m aqui.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_trecho text, p_msg text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when raise_exception or check_violation or unique_violation or insufficient_privilege then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'gestor.conf@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-0000000000c1', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c1', true);

create temp table ids (nome text primary key, id uuid);

do $$
declare op uuid; a uuid; b uuid; c uuid; d uuid; e uuid;
  -- recomposição posterior à conclusão: recente (na garantia de 24 m) e antiga (vencida)
  recente date := '2026-09-25';
  antiga  date := '2024-01-01';
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Conflito S.A.', 'OpConf', 'operadora', 'op@c.test') returning id into op;

  -- Todas anteriores à Resolução (decisão < 09/09/2026): dispensa APTA/ART.
  -- A = alvo (vigente, ponto -43.12300 / -22.89500)
  a := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-A','numero','A/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2026-09-02','situacao','deferida','inicio_previsto','2026-09-10','fim_previsto','2026-12-01'),
    jsonb_build_array(jsonb_build_object('logradouro','Rua Alvo','inicio_lat',-22.89500,'inicio_lng',-43.12300)));

  -- B = vigente a ~5 m, janela sobreposta  → deve conflitar (vigente).
  --     Passa recomposicao_data sem conclusão: o gatilho deve zerá-la.
  b := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-B','numero','B/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2026-09-02','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-11-01','recomposicao_data', recente),
    jsonb_build_array(jsonb_build_object('logradouro','Rua B','inicio_lat',-22.89505,'inicio_lng',-43.12300)));

  -- C = concluída a ~10 m, recomposta há 30 dias (na garantia) → recomposicao.
  c := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-C','numero','C/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2026-09-02','situacao','deferida','inicio_previsto','2026-09-10','fim_previsto','2026-12-01','concluida_em','2026-09-20','recomposicao_data', recente),
    jsonb_build_array(jsonb_build_object('logradouro','Rua C','inicio_lat',-22.89500,'inicio_lng',-43.12310)));

  -- D = vigente, porém a ~30 m → fora do raio, não conflita.
  d := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-D','numero','D/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2026-09-02','situacao','deferida','inicio_previsto','2026-10-01','fim_previsto','2026-11-01'),
    jsonb_build_array(jsonb_build_object('logradouro','Rua D','inicio_lat',-22.89527,'inicio_lng',-43.12300)));

  -- E = concluída a ~5 m, mas recomposta há 30 meses → garantia vencida, não conflita.
  e := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-E','numero','E/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',op,'protocolo_data','2023-01-05','situacao','deferida','inicio_previsto','2023-01-15','fim_previsto','2023-06-01','concluida_em','2023-02-01','recomposicao_data', antiga),
    jsonb_build_array(jsonb_build_object('logradouro','Rua E','inicio_lat',-22.89500,'inicio_lng',-43.12295)));

  insert into ids values ('a',a),('b',b),('c',c),('d',d),('e',e);

  -- Recomposição só existe com conclusão: B não foi concluída.
  perform pg_temp.assert((select recomposicao_data from licencas where id = b) is null,
    'recomposição não deveria ser gravada sem conclusão');
  perform pg_temp.assert((select recomposicao_data from licencas where id = c) = recente,
    'recomposição da obra concluída não foi gravada');

  -- Conflitos do alvo A: exatamente B (vigente) e C (recomposicao).
  perform pg_temp.assert((select count(*) from public.conflitos_de_licenca(a)) = 2,
    'o alvo deveria ter exatamente 2 conflitos');
  perform pg_temp.assert(
    exists(select 1 from public.conflitos_de_licenca(a) where licenca_id = b and tipo = 'vigente'),
    'B deveria conflitar como obra vigente');
  perform pg_temp.assert(
    exists(select 1 from public.conflitos_de_licenca(a) where licenca_id = c and tipo = 'recomposicao'),
    'C deveria conflitar como recomposição em garantia');
  perform pg_temp.assert(
    not exists(select 1 from public.conflitos_de_licenca(a) where licenca_id in (d, e)),
    'obra longe (D) ou com garantia vencida (E) não deveria conflitar');
  perform pg_temp.assert(
    (select distancia_m from public.conflitos_de_licenca(a) where licenca_id = b) <= 15,
    'a distância do conflito B deveria ser ≤ 15 m');
end $$;

-- Recomposição anterior à conclusão: recusada pelo gatilho.
do $$
declare op uuid := (select id from empresas where cnpj = '12345678000195');
begin
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-F','numero','F/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id',%L,'protocolo_data','2026-09-02','situacao','deferida','inicio_previsto','2026-09-10','fim_previsto','2026-12-01','concluida_em','2026-09-20','recomposicao_data','2026-09-15'),
    jsonb_build_array(jsonb_build_object('logradouro','Rua F','inicio_lat',-22.898,'inicio_lng',-43.118)))$q$, op),
    'recomposição do pavimento não pode ser anterior', 'aceitou recomposição anterior à conclusão');
end $$;

rollback;
