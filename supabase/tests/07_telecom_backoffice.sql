-- =====================================================================
-- Testes — cadastro de telecom pela Prefeitura (área /telecom)
--
-- Reproduz, como servidor da SECONSER e sob RLS, exatamente as gravações
-- que a tela faz: operadora, terceirizada, obra programada e serviço de
-- rotina, com suas mudanças de situação.
-- =====================================================================
begin;
set local search_path = public, extensions;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create temporary table fx (k text primary key, v uuid) on commit drop;
insert into fx values ('gestor', '00000000-0000-4000-8000-000000000002');

do $$
begin
  if not exists (select 1 from pg_roles where rolname='cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
  grant authenticated to cadex_test_app;
end $$;
grant usage on schema public, cadex, auth to cadex_test_app;
grant execute on all functions in schema cadex to cadex_test_app;
grant execute on all functions in schema auth to cadex_test_app;
grant select, insert on fx to cadex_test_app;

-- O GRANT amplo acima esconderia a falta de permissão real: os triggers
-- rodam como o usuário logado, que no Supabase é `authenticated`.
select assert(has_function_privilege('authenticated', 'cadex.is_company_active(uuid)', 'execute'),
  'authenticated sem EXECUTE em is_company_active — cadastro de obra falharia em produção');

set local role cadex_test_app;

do $$
declare
  g uuid; tel uuid; op uuid; terc uuid; t_obra uuid; t_rot uuid;
  obra uuid; serv uuid; decl uuid; st text;
begin
  select v into g from fx where k='gestor';
  perform set_config('cadex.test_user_id', g::text, true);

  select id into tel from qualifications where code = 'TELECOM';

  -- Operadora
  insert into companies (cnpj, legal_name, email, is_concessionaire,
                         status, valid_from, valid_until)
  values ('11222333000181', 'Operadora Teste S.A.', 'op@t.local', true,
          'ativo', current_date, (current_date + interval '12 months')::date)
  returning id into op;
  insert into company_qualifications (company_id, qualification_id) values (op, tel);

  -- Terceirizada, vinculada à operadora
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('22333444000181', 'Terceirizada Teste Ltda.', 'te@t.local',
          'ativo', current_date, (current_date + interval '12 months')::date)
  returning id into terc;
  insert into company_qualifications (company_id, qualification_id) values (terc, tel);
  insert into company_relationships (parent_id, child_id, relation)
  values (op, terc, 'subcontratacao');

  -- Obra programada: operadora contrata, terceirizada executa
  select id into t_obra from intervention_types where code = 'VALA';
  insert into interventions (kind, type_id, concessionaire_id, executor_id,
                             geom, address, district, description, starts_on, ends_on)
  values ('obra', t_obra, op, terc, 'SRID=4326;POINT(-43.10 -22.88)',
          'Rua da Conceição, 100', 'Centro', 'Lançamento de fibra',
          current_date + 5, current_date + 20)
  returning id into obra;
  perform assert(obra is not null, 'servidor não conseguiu cadastrar obra');

  update interventions set started_at = now() where id = obra;
  update interventions set finished_at = now() where id = obra;
  perform assert((select finished_at from interventions where id = obra) is not null,
    'servidor não conseguiu registrar o andamento da obra');

  -- Serviço de rotina
  select id into t_rot from intervention_types where code = 'EMENDA';
  insert into interventions (kind, type_id, concessionaire_id, executor_id,
                             geom, address, district, description)
  values ('manutencao', t_rot, op, terc, 'SRID=4326;POINT(-43.11 -22.89)',
          'Rua XV de Novembro, 50', 'Centro', 'Emenda de cabo óptico')
  returning id into serv;
  insert into declarations (intervention_id, status, scheduled_start, scheduled_end)
  values (serv, 'registrada', now() + interval '1 day', now() + interval '1 day 4 hours')
  returning id into decl;

  perform assert((select declaration_number from declarations where id = decl) is not null,
    'serviço de rotina não recebeu número');

  update declarations set status = 'em_execucao' where id = decl;
  update declarations set status = 'encerrada', closed_at = now() where id = decl;
  select status::text into st from declarations where id = decl;
  perform assert(st = 'encerrada', 'serviço de rotina não chegou a encerrado: ' || st);

  -- Edição: contato da empresa, dados da obra e agenda do serviço
  update companies set email = 'novo@t.local', phone = '(21) 99999-0000' where id = op;
  perform assert((select email from companies where id = op) = 'novo@t.local',
    'servidor não conseguiu editar a operadora');

  update interventions set description = 'Lançamento de fibra — trecho 2',
         ends_on = current_date + 30 where id = obra;
  perform assert((select ends_on from interventions where id = obra) = current_date + 30,
    'servidor não conseguiu editar a obra');

  update declarations set scheduled_start = now() + interval '3 days' where id = decl;
  perform assert((select scheduled_start from declarations where id = decl) > now() + interval '2 days',
    'servidor não conseguiu editar a agenda do serviço');

  -- Terceirizada não vinculada não aparece como terceirizada da operadora
  perform assert(
    (select count(*) from company_relationships
      where parent_id = op and relation = 'subcontratacao' and active) = 1,
    'vínculo de terceirização não registrado');
end $$;

-- Sem papel de servidor, nada disto é possível: uma empresa não cadastra
-- operadora nem obra em nome de outra.
do $$
declare u uuid := gen_random_uuid(); op uuid;
begin
  perform set_config('cadex.test_user_id', u::text, true);
  begin
    insert into companies (cnpj, legal_name, email, status)
    values ('33444555000181', 'Intrusa', 'x@t.local', 'ativo');
    raise exception 'ASSERT FALHOU: usuário sem papel cadastrou empresa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- O visitante sem login consulta o mapa público, e a view chama
-- is_company_active por linha: sem EXECUTE para anon a página quebra.
reset role;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public_interventions where executor_cadex_active;
  if n = 0 then
    raise exception 'ASSERT FALHOU: serviço encerrado da operadora ativa não aparece no mapa público';
  end if;
end $$;

reset role;
rollback;
