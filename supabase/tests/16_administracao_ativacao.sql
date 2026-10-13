-- =====================================================================
-- Painel administrativo: desativar acesso sem apagar, nunca ficar sem
-- administrador ativo, empresa desativável só pelo administrador e
-- auditoria que não se altera nem se apaga.
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
  when raise_exception or check_violation or unique_violation or insufficient_privilege or foreign_key_violation then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if p_trecho is not null and position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000031', 'admin1@niteroi.test'),
  ('00000000-0000-4000-8000-000000000032', 'admin2@niteroi.test'),
  ('00000000-0000-4000-8000-000000000033', 'gestor@niteroi.test'),
  ('00000000-0000-4000-8000-000000000034', 'cisp@niteroi.test');
insert into servidores (user_id, nome, papel, administrador) values
  ('00000000-0000-4000-8000-000000000031', 'Admin Um', 'gestor', true),
  ('00000000-0000-4000-8000-000000000032', 'Admin Dois', 'gestor', true),
  ('00000000-0000-4000-8000-000000000033', 'Gestor Comum', 'gestor', false),
  ('00000000-0000-4000-8000-000000000034', 'Consulta', 'cisp', false);

insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, setores, executa_obras) values
  ('12345678000195', 'Operadora Ativa S.A.', 'OpAtiva', 'operadora', 'a@t.test', '{telecom}', true),
  ('11222333000181', 'Operadora Parada S.A.', 'OpParada', 'operadora', 'p@t.test', '{telecom}', true);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

-- ---------------------------------------------------------------------
-- Administrador desativa e reativa sem apagar
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
begin
  perform public.admin_definir_ativo('00000000-0000-4000-8000-000000000033', false);
  perform pg_temp.assert((select not ativo and papel = 'gestor' and nome = 'Gestor Comum'
                            from public.admin_listar_contas() where email = 'gestor@niteroi.test'),
    'desativar apagou ou alterou nome e perfil');
  perform pg_temp.assert((select ativo from public.admin_listar_contas() where email = 'admin1@niteroi.test'),
    'a lista não mostra o acesso ativo');

  perform pg_temp.recusa($q$select public.admin_definir_ativo('00000000-0000-4000-8000-000000000031', false)$q$,
    'próprio acesso', 'administrador desativou o próprio acesso');
  perform pg_temp.recusa($q$select public.admin_definir_ativo('00000000-0000-4000-8000-0000000000ff', false)$q$,
    'não tem acesso', 'desativou conta sem acesso ao CADEX');
end $$;

-- O desativado perde tudo, mesmo com a sessão aberta.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000033', true);
do $$
begin
  perform pg_temp.assert(not public.is_servidor(), 'desativado ainda é servidor');
  perform pg_temp.assert(not public.is_gestor(), 'desativado ainda é gestor');
  perform pg_temp.assert((select count(*) from public.empresas) = 0, 'desativado ainda lê as empresas');
  perform pg_temp.recusa($q$insert into public.empresas (cnpj, razao_social, tipo, email)
                           values ('45997418000153', 'Desativado Ltda.', 'operadora', 'd@t.test')$q$,
    null, 'desativado cadastrou empresa');
  perform pg_temp.recusa($q$select public.admin_definir_ativo('00000000-0000-4000-8000-000000000033', true)$q$,
    'Só administrador', 'desativado se reativou sozinho');
end $$;

-- Reativado, volta ao que era.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
begin
  perform public.admin_definir_ativo('00000000-0000-4000-8000-000000000033', true);
end $$;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000033', true);
do $$
begin
  perform pg_temp.assert(public.is_gestor(), 'reativado não voltou a gestor');
  perform pg_temp.assert((select count(*) from public.empresas) = 2, 'reativado não voltou a ler as empresas');
  -- Gestor sem administração não ativa nem desativa ninguém.
  perform pg_temp.recusa($q$select public.admin_definir_ativo('00000000-0000-4000-8000-000000000034', false)$q$,
    'Só administrador', 'gestor comum desativou o CISP');
end $$;

-- ---------------------------------------------------------------------
-- Nunca sem administrador ativo (qualquer caminho)
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
begin
  -- Há dois: desativar um é permitido.
  perform public.admin_definir_ativo('00000000-0000-4000-8000-000000000032', false);
end $$;

reset role;
do $$
begin
  -- Sobrou um. Nenhum caminho o tira: atualização direta, rebaixamento, exclusão.
  perform pg_temp.recusa($q$update servidores set ativo = false where user_id = '00000000-0000-4000-8000-000000000031'$q$,
    'sem administrador ativo', 'último administrador foi desativado');
  perform pg_temp.recusa($q$update servidores set administrador = false where user_id = '00000000-0000-4000-8000-000000000031'$q$,
    'sem administrador ativo', 'último administrador foi rebaixado');
  perform pg_temp.recusa($q$delete from servidores where user_id = '00000000-0000-4000-8000-000000000031'$q$,
    'sem administrador ativo', 'último administrador foi excluído');
  perform pg_temp.recusa($q$delete from auth.users where id = '00000000-0000-4000-8000-000000000031'$q$,
    'sem administrador ativo', 'a exclusão da conta de login levou o último administrador');
  perform pg_temp.assert((select administrador and ativo from servidores where user_id = '00000000-0000-4000-8000-000000000031'),
    'o último administrador foi alterado');

  -- O administrador desativado não conta como "outro": reativa um, e só então o primeiro pode sair.
  update servidores set ativo = true where user_id = '00000000-0000-4000-8000-000000000032';
  update servidores set administrador = false where user_id = '00000000-0000-4000-8000-000000000031';
  perform pg_temp.assert((select count(*) from servidores where administrador and ativo) = 1, 'deveria restar um administrador');
  update servidores set administrador = true where user_id = '00000000-0000-4000-8000-000000000031';
end $$;

-- ---------------------------------------------------------------------
-- Empresa: só o administrador ativa e desativa
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000033', true);
do $$
begin
  perform pg_temp.recusa($q$update empresas set ativa = false where cnpj = '11222333000181'$q$,
    'Só administrador', 'gestor comum desativou uma empresa');
  perform pg_temp.assert((select ativa from empresas where cnpj = '11222333000181'), 'a empresa mudou apesar da recusa');
  -- Mexer em outro campo continua permitido ao gestor.
  update empresas set nome_fantasia = 'OpParada Renomeada' where cnpj = '11222333000181';
end $$;

select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
declare
  v_ativa uuid := (select id from empresas where cnpj = '12345678000195');
  v_parada uuid := (select id from empresas where cnpj = '11222333000181');
  lic uuid; lic2 uuid;
  trecho jsonb := jsonb_build_array(jsonb_build_object('logradouro', 'Rua Mem de Sá', 'inicio_lat', -22.905, 'inicio_lng', -43.11));
begin
  perform pg_temp.assert(public.is_administrador(), 'administrador não reconhecido');

  -- Licença já existente com a empresa ainda ativa.
  lic := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000601/2026','numero','601/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',v_parada,'contratante_id',v_parada,'protocolo_data','2026-09-10','situacao','deferida','decisao_data','2026-09-15',
      'inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);

  update empresas set ativa = false where id = v_parada;
  perform pg_temp.assert(not (select ativa from empresas where id = v_parada), 'o administrador não desativou a empresa');

  -- A licença que já usa a empresa desativada segue editável sem trocá-la.
  update licencas set observacoes = 'Corrigida' where id = lic;
  perform pg_temp.assert((select observacoes from licencas where id = lic) = 'Corrigida',
    'licença com empresa já vinculada não aceitou correção');

  -- Mas não passa a usar a desativada, nem a licença nova a escolhe.
  perform pg_temp.recusa(format($q$select public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000602/2026','tipos_obra',array['vala'],'escopo','x',
      'executora_id','%s','protocolo_data','2026-09-10','situacao','em_analise'), '[]'::jsonb)$q$, v_parada),
    'está desativada', 'licença nova escolheu empresa desativada');

  -- Trocar a executora de uma licença para a desativada também é recusado.
  lic2 := public.salvar_licenca(jsonb_build_object(
      'setor','telecom','processo_sei','NIT-050120/000603/2026','numero','603/2026','tipos_obra',array['vala'],'escopo','Vala',
      'executora_id',v_ativa,'contratante_id',v_ativa,'protocolo_data','2026-09-10','situacao','deferida','decisao_data','2026-09-15',
      'inicio_previsto','2026-10-01','fim_previsto','2026-10-30'), trecho);
  perform pg_temp.recusa(format('update licencas set executora_id = %L, contratante_id = %L where id = %L', v_parada, v_parada, lic2),
    'está desativada', 'licença passou a usar empresa desativada');

  -- Reativada, volta a poder ser escolhida.
  update empresas set ativa = true where id = v_parada;
  update licencas set executora_id = v_parada, contratante_id = v_parada where id = lic2;
end $$;

-- ---------------------------------------------------------------------
-- Auditoria: nem alterar, nem apagar, nem esvaziar (mesmo com acesso direto)
-- ---------------------------------------------------------------------
reset role;
do $$
begin
  perform pg_temp.assert(exists (select 1 from auditoria where tabela = 'servidores' and operacao = 'UPDATE'
                                    and depois ->> 'ativo' = 'false'
                                    and por = '00000000-0000-4000-8000-000000000031'),
    'a desativação não ficou na auditoria com o administrador responsável');
  perform pg_temp.assert(exists (select 1 from auditoria where tabela = 'empresas' and operacao = 'UPDATE'
                                    and depois ->> 'ativa' = 'false'),
    'a desativação da empresa não ficou na auditoria');

  perform pg_temp.recusa('update auditoria set por_nome = ''X''', 'não pode ser alterado', 'auditoria foi alterada');
  perform pg_temp.recusa('delete from auditoria', 'não pode ser alterado', 'auditoria foi apagada');
  perform pg_temp.recusa('truncate auditoria', 'não pode ser alterado', 'auditoria foi esvaziada');
end $$;

-- Leitura: só o administrador. O gestor comum não vê nada, mesmo pela API.
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000033', true);
do $$
begin
  perform pg_temp.assert((select count(*) from public.auditoria) = 0, 'gestor comum leu a auditoria');
end $$;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000034', true);
do $$
begin
  perform pg_temp.assert((select count(*) from public.auditoria) = 0, 'CISP leu a auditoria');
end $$;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
begin
  perform pg_temp.assert((select count(*) from public.auditoria) > 0, 'o administrador não leu a auditoria');
end $$;
select set_config('cadex.test_aal', 'aal1', true);
do $$
begin
  perform pg_temp.assert((select count(*) from public.auditoria) = 0, 'administrador só com a senha leu a auditoria');
end $$;
select set_config('cadex.test_aal', 'aal2', true);

-- E o app não grava nem apaga nela por nenhum caminho.
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000031', true);
do $$
begin
  perform pg_temp.recusa($q$delete from public.auditoria$q$, null, 'o app apagou auditoria');
  perform pg_temp.recusa($q$insert into public.auditoria (tabela, operacao) values ('x', 'INSERT')$q$, null, 'o app gravou auditoria');
end $$;

rollback;
