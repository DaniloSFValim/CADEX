-- =====================================================================
-- Portal da empresa: isolamento entre empresas, verificação em duas
-- etapas, vínculo desativado, exclusividade com servidor e o que o
-- representante NÃO pode fazer.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

create or replace function pg_temp.recusa(p_sql text, p_msg text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_msg || '%' then
      raise exception 'ASSERT FALHOU: erro inesperado em "%": %', p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'ASSERT FALHOU: operação foi aceita: %', p_sql;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
grant anon to cadex_test_app;

-- Usuários: gestor (servidor), dois representantes, um desativado, e uma
-- pessoa sem vínculo nenhum.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'gestor.portal@niteroi.test'),
  ('00000000-0000-4000-8000-000000000102', 'rep.a@empresa.test'),
  ('00000000-0000-4000-8000-000000000103', 'rep.b@empresa.test'),
  ('00000000-0000-4000-8000-000000000104', 'inativo.a@empresa.test'),
  ('00000000-0000-4000-8000-000000000105', 'sem.vinculo@teste.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-000000000101', 'Gestor Portal', 'gestor', false);

-- Cadastros, como dono da tabela, sem gatilhos de situação (como nos outros testes).
alter table empresas disable trigger user;
alter table licencas disable trigger user;
insert into empresas (id, cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex) values
  ('00000000-0000-4000-8000-00000000a001', '33000167000101', 'Empresa A Portal Ltda.', 'operadora', 'a@portal.test', '{telecom}', true, 'em_analise', true, 'CADEX-PTA-0001'),
  ('00000000-0000-4000-8000-00000000b001', '24144040000175', 'Empresa B Portal Ltda.', 'operadora', 'b@portal.test', '{telecom}', true, 'em_analise', true, 'CADEX-PTB-0001');
insert into licencas (id, setor, processo_sei, tipos_obra, escopo, executora_id, contratante_id, protocolo_data, situacao,
                      inicio_previsto, fim_previsto, numero)
values
  ('00000000-0000-4000-8000-00000000c001', 'telecom', 'PTL-0001', array['vala'], 'Licença da empresa A',
   '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a001', '2026-09-10', 'deferida', '2026-10-01', '2026-10-30', '901/2026'),
  ('00000000-0000-4000-8000-00000000c002', 'telecom', 'PTL-0002', array['vala'], 'Licença só da empresa B',
   '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b001', '2026-09-10', 'deferida', '2026-10-01', '2026-10-30', '902/2026');
alter table licencas enable trigger user;
alter table empresas enable trigger user;

-- Vínculos, como dono: dois representantes e um inativo.
insert into empresa_usuarios (user_id, empresa_id, papel, ativo) values
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-00000000a001', 'representante', true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-00000000b001', 'operador', true);
insert into empresa_usuarios (user_id, empresa_id, papel, ativo, desativado_em) values
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-00000000a001', 'representante', false, now());

-- 1. Representante A (com verificação em duas etapas) vê só a própria empresa.
do $$
declare n int; achou uuid;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*), min(id::text)::uuid into n, achou from empresas;
  reset role;
  perform pg_temp.assert(n = 1 and achou = '00000000-0000-4000-8000-00000000a001', 'representante A não viu só a própria empresa');
end $$;

-- 2. Representante A vê só as licenças em que a empresa A executa ou contrata.
do $$
declare n int; achou text;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*), min(numero) into n, achou from empresa_licencas;
  reset role;
  perform pg_temp.assert(n = 1 and achou = '901/2026', 'visão de licenças vazou licença de outra empresa');
end $$;

-- 3. Sem verificação em duas etapas (aal1), o representante não vê nada.
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal1', true);
  select count(*) into n from empresas;
  reset role;
  perform pg_temp.assert(n = 0, 'representante sem MFA viu empresa');
end $$;

-- 4. Representante A não registra comunicação para a empresa B.
do $$
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  perform pg_temp.recusa(format($q$insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, inicio_previsto, fim_previsto)
    values (%L, 'Fulano', array['ABC1234'], 'Rua X', 'Serviço', current_date + 5, current_date + 5)$q$,
    '00000000-0000-4000-8000-00000000b001'), 'row-level security');
  reset role;
end $$;

-- 5. Representante A registra comunicação para a própria empresa, e a placa é normalizada.
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, inicio_previsto, fim_previsto)
  values ('00000000-0000-4000-8000-00000000a001', 'Fulano de Tal', array['abc-1234'], 'Rua A, 10', 'Manutenção', current_date + 5, current_date + 5);
  select count(*) into n from comunicacoes_servico;
  reset role;
  perform pg_temp.assert(n = 1, 'representante A não viu a própria comunicação');
  perform pg_temp.assert(exists (select 1 from comunicacoes_servico where placas = array['ABC1234']),
    'placa não foi normalizada na comunicação da empresa');
end $$;

-- 6. Representante A não lê comunicação da empresa B (criada como dono da tabela).
insert into comunicacoes_servico (empresa_id, responsavel, placas, local_servico, descricao, inicio_previsto, fim_previsto)
values ('00000000-0000-4000-8000-00000000b001', 'Outro', array['DEF5678'], 'Rua B', 'Serviço B', current_date + 5, current_date + 5);
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*) into n from comunicacoes_servico where empresa_id = '00000000-0000-4000-8000-00000000b001';
  reset role;
  perform pg_temp.assert(n = 0, 'representante A leu comunicação da empresa B');
end $$;

-- 7. Representante não altera o próprio vínculo (não há política de gravação para ele).
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000102', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  update empresa_usuarios set ativo = true where user_id = '00000000-0000-4000-8000-000000000102';
  get diagnostics n = row_count;
  reset role;
  perform pg_temp.assert(n = 0, 'representante alterou o próprio vínculo');
end $$;

-- 8. Vínculo desativado não acessa nada.
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000104', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*) into n from empresas;
  reset role;
  perform pg_temp.assert(n = 0, 'vínculo desativado ainda viu empresa');
end $$;

-- 9. Usuário sem vínculo não vê licença de empresa.
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000105', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*) into n from empresa_licencas;
  reset role;
  perform pg_temp.assert(n = 0, 'usuário sem vínculo viu licença de empresa');
end $$;

-- 10. Exclusividade: servidor não vira representante, e representante não vira servidor.
do $$
begin
  perform pg_temp.recusa(format('insert into empresa_usuarios (user_id, empresa_id, papel) values (%L, %L, %L)',
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-00000000a001', 'operador'), 'é servidor');
  perform pg_temp.recusa(format('insert into servidores (user_id, nome, papel) values (%L, %L, %L)',
    '00000000-0000-4000-8000-000000000102', 'Não pode', 'gestor'), 'acesso de empresa');
end $$;

-- 11. Servidor continua vendo as comunicações de todas as empresas.
do $$
declare n int;
begin
  set local role cadex_test_app;
  perform set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000101', true);
  perform set_config('cadex.test_aal', 'aal2', true);
  select count(*) into n from comunicacoes_servico;
  reset role;
  perform pg_temp.assert(n = 2, 'servidor deixou de ver as comunicações de todas as empresas');
end $$;

-- 12. Anônimo não lê a visão de licenças nem a tabela de vínculos.
do $$
begin
  perform pg_temp.assert(not has_table_privilege('anon', 'public.empresa_licencas', 'select'), 'anônimo lê a visão de licenças');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.empresa_usuarios', 'select'), 'anônimo lê os vínculos');
end $$;

rollback;
