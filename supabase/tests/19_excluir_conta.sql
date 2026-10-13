-- =====================================================================
-- Exclusão de conta: só administrador, nunca a si mesmo nem o último
-- administrador ativo; guarda quem era, remove o acesso e deixa o histórico.
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
  ('00000000-0000-4000-8000-0000000000b1', 'admin1.conta@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'admin2.conta@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'gestor.conta@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'cisp.conta@niteroi.test'),
  ('00000000-0000-4000-8000-0000000000b5', 'semacesso.conta@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-0000000000b1', 'Admin Um', 'gestor', true),
  ('00000000-0000-4000-8000-0000000000b2', 'Admin Dois', 'gestor', true),
  ('00000000-0000-4000-8000-0000000000b3', 'Gestor Comum', 'gestor', false),
  ('00000000-0000-4000-8000-0000000000b4', 'Consulta', 'cisp', false);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;
set local role cadex_test_app;

-- O gestor comum faz uma alteração, que fica na auditoria com o nome dele.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b3', true);
do $$
begin
  insert into empresas (cnpj, razao_social, tipo, email) values ('12345678000195', 'Operadora Conta S.A.', 'operadora', 'c@c.test');
end $$;

-- 1. Quem não é administrador não exclui nem consulta vínculos.
do $$
begin
  perform pg_temp.recusa($q$select public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b4')$q$, 'Só administrador', 'gestor excluiu conta');
  perform pg_temp.recusa($q$select public.admin_vinculos_da_conta('00000000-0000-4000-8000-0000000000b3')$q$, 'Só administrador', 'gestor leu vínculos');
  perform pg_temp.assert((select count(*) from usuarios_excluidos) = 0, 'gestor lê usuarios_excluidos');
end $$;

-- 2. Administrador: não exclui a si mesmo; conta inexistente é recusada.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b1', true);
do $$
begin
  perform pg_temp.recusa($q$select public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b1')$q$, 'própria conta', 'administrador excluiu a si mesmo');
  perform pg_temp.recusa($q$select public.admin_excluir_conta('00000000-0000-4000-8000-0000000000ff')$q$, 'não encontrada', 'conta inexistente foi aceita');
  -- Os vínculos aparecem para conferência: o gestor tem eventos na auditoria.
  perform pg_temp.assert((public.admin_vinculos_da_conta('00000000-0000-4000-8000-0000000000b3') ->> 'eventos_auditoria')::int >= 1,
    'vínculos não contaram o que o gestor fez');
end $$;

-- 3. Exclui o gestor: acesso removido, identificação guardada, auditoria registrada, histórico preservado.
do $$
declare r jsonb;
begin
  r := public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b3');
  perform pg_temp.assert(r ->> 'email' = 'gestor.conta@niteroi.test' and r ->> 'nome' = 'Gestor Comum', 'resumo da exclusão errado: ' || r::text);
  perform pg_temp.assert(not exists (select 1 from servidores where user_id = '00000000-0000-4000-8000-0000000000b3'), 'o acesso não foi removido');
  perform pg_temp.assert((select email = 'gestor.conta@niteroi.test' and nome = 'Gestor Comum' and papel = 'gestor'
                                 and excluido_por = '00000000-0000-4000-8000-0000000000b1' and excluido_por_nome = 'Admin Um'
                            from usuarios_excluidos where user_id = '00000000-0000-4000-8000-0000000000b3'), 'identificação não foi guardada');
  perform pg_temp.assert((select count(*) from auditoria where tabela = 'contas' and registro_id = '00000000-0000-4000-8000-0000000000b3'
                                 and operacao = 'DELETE' and por = '00000000-0000-4000-8000-0000000000b1') = 1, 'a exclusão não foi para a auditoria');
  -- O que o gestor fez continua na auditoria, com o nome dele, mesmo sem a conta.
  perform pg_temp.assert((select count(*) from auditoria where por = '00000000-0000-4000-8000-0000000000b3' and por_nome = 'Gestor Comum') >= 1,
    'o histórico do gestor perdeu a autoria');
end $$;

-- 3b. Quem teve o acesso removido não entra mais.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b3', true);
do $$
begin
  perform pg_temp.assert(not public.is_servidor(), 'conta excluída ainda é servidor');
  perform pg_temp.assert((select count(*) from empresas) = 0, 'conta excluída ainda lê empresas');
end $$;

-- 4. Conta sem acesso ao CADEX (só o login) também pode ser excluída.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b1', true);
do $$
declare r jsonb;
begin
  r := public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b5');
  perform pg_temp.assert(r ->> 'nome' is null and r ->> 'email' = 'semacesso.conta@niteroi.test', 'conta sem acesso não foi identificada');
end $$;

-- 5. Último administrador ativo. Quem chama precisa ser administrador ativo, então o único jeito de excluir o
--    último é ele excluir a si mesmo, o que já é recusado. Administrador desativado não age.
reset role;
update servidores set ativo = false where user_id = '00000000-0000-4000-8000-0000000000b1';
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-0000000000b2', true);
do $$
begin
  perform pg_temp.recusa($q$select public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b2')$q$, 'própria conta', 'o último administrador excluiu a si mesmo');
  -- O outro administrador (desativado) pode ser excluído pelo único ativo; o ativo continua lá.
  perform public.admin_excluir_conta('00000000-0000-4000-8000-0000000000b1');
  perform pg_temp.assert(exists (select 1 from servidores where user_id = '00000000-0000-4000-8000-0000000000b2' and administrador and ativo),
    'o último administrador ativo sumiu');
end $$;

rollback;
