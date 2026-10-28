-- =====================================================================
-- Prorrogação de validade contada: só quem grava licenças prorroga; a nova
-- data precisa ser posterior à atual; cada prorrogação soma 1; uma nova
-- alteração do início não mexe numa validade já prorrogada.
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

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'gestor.pro@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000d2', 'cisp.pro@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000d1', 'Gestor Pro', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000d2', 'Consulta Pro', 'cisp', false);

create temp table ids (nome text primary key, id uuid);
grant select, insert, update on ids to public;

do $$
declare op uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, executa_obras)
  values ('12345678000195', 'Operadora Pro S.A.', 'OpPro', 'operadora', 'pro@e.test', true) returning id into op;
  insert into ids values ('op', op);
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;
set local role cadex_test_app;

-- Gestor cadastra uma licença deferida (validade = início + 30 pelo gatilho).
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000d1', true);
do $$
declare
  op uuid := (select id from ids where nome = 'op');
  a uuid;
begin
  a := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000901/2026','numero','901/2026',
    'tipo_intervencao','obra','tipos_obra',array['vala'],'escopo','Prorrogável','executora_id',op,
    'protocolo_data','2026-09-15','situacao','deferida',
    'inicio_previsto','2026-10-01','fim_previsto','2026-11-30'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11)));
  insert into ids values ('a', a);
end $$;

-- 1. Validade inicial e contagem zerada.
do $$
declare r licencas;
begin
  select * into r from licencas where id = (select id from ids where nome = 'a');
  perform pg_temp.assert(r.validade_ate = date '2026-10-31' and r.prorrogacoes = 0, 'validade inicial = início + 30, sem prorrogação');
end $$;

-- 2. Gestor prorroga: vai para 1ª prorrogação.
do $$
begin
  perform public.prorrogar_licenca((select id from ids where nome = 'a'), date '2026-12-15');
  perform pg_temp.assert((select validade_ate = date '2026-12-15' and prorrogacoes = 1 from licencas where id = (select id from ids where nome = 'a')),
    'primeira prorrogação grava a data e soma 1');
end $$;

-- 3. Segunda prorrogação: 2ª.
do $$
begin
  perform public.prorrogar_licenca((select id from ids where nome = 'a'), date '2027-02-15');
  perform pg_temp.assert((select prorrogacoes = 2 from licencas where id = (select id from ids where nome = 'a')),
    'segunda prorrogação soma 2');
end $$;

-- 4. Data que não é posterior à atual é recusada, e a contagem não muda.
select pg_temp.recusa(format('select public.prorrogar_licenca(%L, %L)', (select id from ids where nome = 'a'), '2027-01-01'),
  'posterior', 'prorrogar para data anterior à atual deve ser recusado');
do $$
begin
  perform pg_temp.assert((select prorrogacoes = 2 from licencas where id = (select id from ids where nome = 'a')),
    'recusa não altera a contagem');
end $$;

-- 5. Consulta (cisp) não prorroga.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000d2', true);
select pg_temp.recusa(format('select public.prorrogar_licenca(%L, %L)', (select id from ids where nome = 'a'), '2027-06-01'),
  'Sem permissão', 'consulta não pode prorrogar');

-- 6. Mudar o início não recalcula uma validade já prorrogada, e a contagem fica.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000d1', true);
update licencas set inicio_previsto = date '2026-10-05' where id = (select id from ids where nome = 'a');
do $$
begin
  perform pg_temp.assert((select validade_ate = date '2027-02-15' and prorrogacoes = 2 from licencas where id = (select id from ids where nome = 'a')),
    'alterar o início preserva a prorrogação e a contagem');
end $$;

rollback;
