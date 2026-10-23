-- =====================================================================
-- Órgão público contratante aparece nos dados públicos (obras_publicas e
-- obras_geojson), como já aparece na página da licença. Licença contratada
-- por órgão não pode sair com o contratante vazio.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e1', 'gestor.orgao@niteroi.test');
insert into servidores (user_id, nome, papel) values ('00000000-0000-4000-8000-0000000000e1', 'Gestor', 'gestor');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e1', true);

do $$
declare op uuid; orgao uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Orgao S.A.', 'OpOrgao', 'operadora', 'op@o.test') returning id into op;

  insert into orgaos_publicos (nome, sigla, esfera, setores)
  values ('Secretaria Municipal de Mobilidade', 'SEMOB', 'municipal', '{}') returning id into orgao;

  -- Emitida, contratada por órgão (sem empresa contratante).
  perform public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','ORG-1','numero','061/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',op,'orgao_contratante_id',orgao,'origem_intervencao','municipio','protocolo_data','2026-09-02','situacao','deferida',
      'inicio_previsto','2026-09-10','fim_previsto','2026-12-01'),
    jsonb_build_array(jsonb_build_object('logradouro','Rua do Órgão','inicio_lat',-22.895,'inicio_lng',-43.123)));
end $$;

reset role;
set local role anon;
do $$
declare p jsonb := public.obras_publicas();
        g jsonb := public.obras_geojson();
        c text;
begin
  select e ->> 'contratante' into c
    from jsonb_array_elements(p) e where e ->> 'numero' = '061/2026';
  perform pg_temp.assert(c = 'SEMOB', 'obras_publicas sem o órgão contratante: ' || coalesce(c, 'NULL'));

  select f -> 'properties' ->> 'contratante' into c
    from jsonb_array_elements(g -> 'features') f where f -> 'properties' ->> 'numero' = '061/2026';
  perform pg_temp.assert(c = 'SEMOB', 'obras_geojson sem o órgão contratante: ' || coalesce(c, 'NULL'));
end $$;

rollback;
