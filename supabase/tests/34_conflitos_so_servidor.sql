-- =====================================================================
-- conflitos_de_licenca: servidor ativo vê o conflito; conta que não é
-- servidor (ou está inativa) não recebe nenhuma linha.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'servidor.conf@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'visitante.conf@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000c1', 'Servidor Conflito', 'gestor', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;

-- Duas licenças no mesmo ponto, com cronograma sobreposto: há conflito.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c1', true);
do $$
declare op uuid; a uuid; b uuid; n int;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email)
  values ('12345678000195', 'Operadora Conf S.A.', 'OpConf', 'operadora', 'op@conf.test') returning id into op;
  a := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-1','numero','101/2026','tipos_obra',array['vala'],'escopo','Vala A',
      'executora_id',op,'protocolo_data','2026-02-01','situacao','deferida',
      'inicio_previsto',to_char(current_date - 5,'YYYY-MM-DD'),'fim_previsto',to_char(current_date + 60,'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('logradouro','Rua Conflito','inicio_lat',-22.9,'inicio_lng',-43.1)));
  b := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','CONF-2','numero','102/2026','tipos_obra',array['vala'],'escopo','Vala B',
      'executora_id',op,'protocolo_data','2026-02-01','situacao','deferida',
      'inicio_previsto',to_char(current_date - 5,'YYYY-MM-DD'),'fim_previsto',to_char(current_date + 60,'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('logradouro','Rua Conflito','inicio_lat',-22.9,'inicio_lng',-43.1)));
  select count(*) into n from public.conflitos_de_licenca(a);
  perform pg_temp.assert(n >= 1, 'servidor ativo deveria ver o conflito');
  perform set_config('cadex.test_alvo', a::text, true);
end $$;

-- Conta sem vínculo de servidor: mesma consulta, nenhuma linha.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000c2', true);
do $$
declare alvo uuid; n int;
begin
  alvo := current_setting('cadex.test_alvo')::uuid;
  perform pg_temp.assert(alvo is not null, 'alvo do teste ausente');
  select count(*) into n from public.conflitos_de_licenca(alvo);
  perform pg_temp.assert(n = 0, 'conta que não é servidor não deve receber linhas de conflito');
end $$;

rollback;
