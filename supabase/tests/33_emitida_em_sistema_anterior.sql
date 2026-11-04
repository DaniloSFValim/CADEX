-- =====================================================================
-- Licença emitida no sistema anterior: começa desmarcada; o gestor marca;
-- quem não grava licenças não consegue marcar.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'gestor.ant@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'consulta.ant@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000a1', 'Gestor Anterior', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000a2', 'Consulta Anterior', 'cisp', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000a1', true);
do $$
declare op uuid; lic uuid; antes boolean; depois boolean; n int;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Ant S.A.', 'OpAnt', 'operadora', 'op@ant.test') returning id into op;
  lic := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','ANT-1','numero','001/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',op,'protocolo_data','2026-02-01','situacao','deferida',
      'inicio_previsto',to_char(current_date - 5,'YYYY-MM-DD'),'fim_previsto',to_char(current_date + 60,'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('logradouro','Rua Antiga','inicio_lat',-22.9,'inicio_lng',-43.1)));

  select emitida_em_sistema_anterior into antes from licencas where id = lic;
  perform pg_temp.assert(antes = false, 'licença nova não começa desmarcada');

  perform public.definir_emitida_em_sistema_anterior(lic, true);
  select emitida_em_sistema_anterior into depois from licencas where id = lic;
  perform pg_temp.assert(depois = true, 'gestor não conseguiu marcar a licença');

  perform public.definir_emitida_em_sistema_anterior(lic, false);
  select emitida_em_sistema_anterior into depois from licencas where id = lic;
  perform pg_temp.assert(depois = false, 'gestor não conseguiu desmarcar a licença');

  perform public.definir_emitida_em_sistema_anterior(lic, true);
  perform set_config('cadex.test_lic_id', lic::text, true);
end $$;

-- Consulta não grava licença: a marcação não passa pela RLS e a função recusa
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000a2', true);
do $$
declare ok boolean := false;
begin
  begin
    perform public.definir_emitida_em_sistema_anterior(current_setting('cadex.test_lic_id')::uuid, false);
  exception when others then
    ok := position('sem permissão' in sqlerrm) > 0;
  end;
  perform pg_temp.assert(ok, 'consulta conseguiu desmarcar a licença');
  perform pg_temp.assert(exists (select 1 from licencas where id = current_setting('cadex.test_lic_id')::uuid and emitida_em_sistema_anterior),
    'a marcação mudou mesmo com a recusa');
end $$;

rollback;
