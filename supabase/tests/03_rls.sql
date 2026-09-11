-- =====================================================================
-- Testes — RLS / RBAC (§5, §35, §36, §45)
-- Executados como role NÃO superusuário: superusuário ignora RLS, e um
-- teste que roda como superusuário não prova absolutamente nada.
-- =====================================================================
begin;

create or replace function assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_cond then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- Fixtures criadas como superusuário, antes de baixar privilégio.
create temporary table fx (k text primary key, v uuid) on commit drop;

do $$
declare
  u_emp_a uuid := gen_random_uuid();
  u_emp_b uuid := gen_random_uuid();
  u_fiscal uuid := '00000000-0000-4000-8000-000000000003';
  ca uuid; cb uuid; t uuid; iv uuid;
begin
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('05570714000159','Empresa A','a@a.local','ativo',
          current_date-1, current_date+300) returning id into ca;
  insert into companies (cnpj, legal_name, email, status, valid_from, valid_until)
  values ('07526557000100','Empresa B','b@b.local','ativo',
          current_date-1, current_date+300) returning id into cb;

  insert into auth.users (id, email) values
    (u_emp_a,'ea@x.local'), (u_emp_b,'eb@x.local');
  insert into profiles (id, full_name, email, company_id) values
    (u_emp_a,'Preposto A','ea@x.local', ca),
    (u_emp_b,'Preposto B','eb@x.local', cb);
  insert into user_roles (user_id, role) values
    (u_emp_a,'empresa'), (u_emp_b,'empresa');

  select id into t from intervention_types where code='VALA';
  insert into interventions (kind, type_id, executor_id, geom, description)
  values ('obra', t, ca, st_setsrid(st_makepoint(-43.17,-22.90),4326),'obra de A')
  returning id into iv;

  insert into fx values ('ca',ca),('cb',cb),('ua',u_emp_a),('ub',u_emp_b),
                        ('fiscal',u_fiscal),('iv',iv);
end $$;

-- Role de aplicação sem privilégio especial.
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
grant select on fx to cadex_test_app;

set local role cadex_test_app;

-- --- Empresa A não enxerga a Empresa B (§5.6, §36) --------------------
do $$
declare ua uuid; ca uuid; cb uuid; n int;
begin
  select v into ua from fx where k='ua';
  select v into ca from fx where k='ca';
  select v into cb from fx where k='cb';
  perform set_config('cadex.test_user_id', ua::text, true);

  select count(*) into n from companies where id = ca;
  perform assert(n = 1, 'empresa não consegue ver o próprio cadastro');

  select count(*) into n from companies where id = cb;
  perform assert(n = 0, 'VAZAMENTO: empresa A enxergou o cadastro da empresa B');
end $$;

-- --- Empresa B não enxerga a intervenção da Empresa A (§36) -----------
do $$
declare ub uuid; iv uuid; n int;
begin
  select v into ub from fx where k='ub';
  select v into iv from fx where k='iv';
  perform set_config('cadex.test_user_id', ub::text, true);
  select count(*) into n from interventions where id = iv;
  perform assert(n = 0, 'VAZAMENTO: empresa B enxergou intervenção da empresa A');
end $$;

-- --- Empresa não pode atribuir papéis a si mesma (§35) ----------------
do $$
declare ua uuid;
begin
  select v into ua from fx where k='ua';
  perform set_config('cadex.test_user_id', ua::text, true);
  begin
    insert into user_roles (user_id, role) values (ua, 'admin');
    raise exception 'ASSERT FALHOU: ESCALAÇÃO DE PRIVILÉGIO — empresa virou admin';
  exception when insufficient_privilege then null;
  end;
end $$;

-- --- Empresa não lê a trilha de auditoria (§33) -----------------------
do $$
declare ua uuid; n int;
begin
  select v into ua from fx where k='ua';
  perform set_config('cadex.test_user_id', ua::text, true);
  select count(*) into n from audit_logs;
  perform assert(n = 0, 'VAZAMENTO: empresa leu registros de auditoria');
end $$;

-- --- Empresa não valida crachá (função restrita à fiscalização, §21) --
do $$
declare ua uuid;
begin
  select v into ua from fx where k='ua';
  perform set_config('cadex.test_user_id', ua::text, true);
  begin
    perform public.verify_badge('qualquer');
    raise exception 'ASSERT FALHOU: empresa acessou validação de crachá';
  exception when others then
    if position('restrita à fiscalização' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- Empresa não abre o painel administrativo (§30) -------------------
do $$
declare ua uuid;
begin
  select v into ua from fx where k='ua';
  perform set_config('cadex.test_user_id', ua::text, true);
  begin
    perform public.dashboard_metrics();
    raise exception 'ASSERT FALHOU: empresa acessou o painel administrativo';
  exception when others then
    if position('restrito' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- --- Fiscal enxerga qualquer intervenção e abre o painel -------------
do $$
declare f uuid; iv uuid; n int;
begin
  select v into f from fx where k='fiscal';
  select v into iv from fx where k='iv';
  perform set_config('cadex.test_user_id', f::text, true);
  select count(*) into n from interventions where id = iv;
  perform assert(n = 1, 'fiscal não enxergou a intervenção (§24)');
  perform assert(public.dashboard_metrics() is not null,
                 'fiscal não conseguiu ler indicadores');
end $$;

-- --- Fiscal não pode lançar fiscalização em nome de outro ------------
do $$
declare f uuid; ca uuid; ua uuid;
begin
  select v into f from fx where k='fiscal';
  select v into ca from fx where k='ca';
  select v into ua from fx where k='ua';
  perform set_config('cadex.test_user_id', f::text, true);
  begin
    insert into inspections (company_id, inspector_id) values (ca, ua);
    raise exception 'ASSERT FALHOU: fiscal registrou fiscalização em nome de terceiro';
  exception when insufficient_privilege then null;
  end;
  insert into inspections (company_id, inspector_id) values (ca, f);
end $$;

-- --- Usuário anônimo não alcança as tabelas (§36) ---------------------
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from companies;
    raise exception 'ASSERT FALHOU: anon leu a tabela companies diretamente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ...mas alcança a camada pública (§29)
do $$
declare n int;
begin
  select count(*) into n from public_companies;
  perform assert(n >= 0, 'consulta pública de empresas indisponível para anon');
end $$;

reset role;
rollback;
