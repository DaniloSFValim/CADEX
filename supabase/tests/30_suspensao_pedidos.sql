-- =====================================================================
-- Suspensão a pedido: não conta na validade, sai do mapa como vigente;
-- consulta não suspende; pedido de correção abre e fecha sem mudar a situação.
-- Datas relativas a hoje, para o teste valer em qualquer dia.
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
  ('00000000-0000-4000-8000-0000000000e1', 'gestor.sus@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'cisp.sus@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000e1', 'Gestor Sus', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000e2', 'Consulta Sus', 'cisp', false);

create temp table ids (nome text primary key, id uuid);
grant select, insert, update on ids to public;

do $$
declare op uuid;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, executa_obras)
  values ('12345678000195', 'Operadora Sus S.A.', 'OpSus', 'operadora', 'sus@e.test', true) returning id into op;
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

-- Gestor cadastra licença deferida, iniciada há 20 dias (validade = início + 30).
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e1', true);
do $$
declare
  op uuid := (select id from ids where nome = 'op');
  a uuid;
begin
  a := public.salvar_licenca(jsonb_build_object('setor','telecom','processo_sei','NIT-050120/000930/2026','numero','930/2026',
    'tipo_intervencao','obra','tipos_obra',array['vala'],'escopo','Suspensa a pedido','executora_id',op,
    'protocolo_data',to_char(current_date - 40,'YYYY-MM-DD'),'situacao','deferida',
    'inicio_previsto',to_char(current_date - 20,'YYYY-MM-DD'),'fim_previsto',to_char(current_date + 60,'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11)));
  insert into ids values ('a', a);
end $$;

-- 1. Consulta não suspende.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e2', true);
select pg_temp.recusa(format('select public.suspender_licenca(%L, %L, %L)', (select id from ids where nome = 'a'),
  to_char(current_date - 5,'YYYY-MM-DD'), 'Pedido da obra'), 'Sem permissão', 'consulta não pode suspender');

-- 2. Gestor suspende desde 5 dias atrás: aparece suspensa no mapa público.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000e1', true);
do $$
begin
  perform public.suspender_licenca((select id from ids where nome = 'a'), current_date - 5, 'Obra parada por ordem da fiscalização');
  perform pg_temp.assert((select count(*) from licenca_suspensoes where licenca_id = (select id from ids where nome = 'a') and fim is null) = 1,
    'suspensão ativa criada');
  perform pg_temp.assert((select elem->>'situacao' from jsonb_array_elements(public.obras_publicas()) elem
                           where elem->>'numero' = '930/2026') = 'suspensa',
    'mapa público mostra a licença como suspensa');
end $$;

-- 3. Segunda suspensão ativa é recusada.
select pg_temp.recusa(format('select public.suspender_licenca(%L, %L, %L)', (select id from ids where nome = 'a'),
  to_char(current_date - 3,'YYYY-MM-DD'), 'Outra'), null, 'não pode haver duas suspensões ativas');

-- 4. Retomar em 2 dias atrás: suspensão de 4 dias (inclusive) estende a validade.
do $$
declare v_antes date;
begin
  select validade_ate into v_antes from licencas where id = (select id from ids where nome = 'a');
  perform public.retomar_licenca((select id from ids where nome = 'a'), current_date - 2);
  perform pg_temp.assert((select validade_ate from licencas where id = (select id from ids where nome = 'a')) = v_antes + 4,
    'validade estendida pelos dias suspensos (inclusive)');
  perform pg_temp.assert((select elem->>'situacao' from jsonb_array_elements(public.obras_publicas()) elem
                           where elem->>'numero' = '930/2026') = 'vigente',
    'retomada volta a aparecer como vigente');
end $$;

-- 5. Pedido de correção: abre, conta como aberto e fecha; a situação não muda.
do $$
declare v_pedido uuid;
begin
  v_pedido := public.pedir_correcao((select id from ids where nome = 'a'), 'Falta a recomposição do pavimento');
  perform pg_temp.assert((select count(*) from licenca_pedidos_correcao where licenca_id = (select id from ids where nome = 'a') and resolvido_em is null) = 1,
    'pedido de correção aberto');
  perform pg_temp.assert((select situacao from licencas where id = (select id from ids where nome = 'a')) = 'deferida',
    'pedido de correção não muda a situação');
  perform public.resolver_correcao(v_pedido, 'Recomposição feita e comprovada');
  perform pg_temp.assert((select count(*) from licenca_pedidos_correcao where licenca_id = (select id from ids where nome = 'a') and resolvido_em is null) = 0,
    'pedido resolvido sai dos abertos');
end $$;

rollback;
