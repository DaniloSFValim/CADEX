-- =====================================================================
-- Papel LICENCIADOR: registra licenças de obra, nada além disso.
--   - grava licença (RLS licencas_gravar);
--   - NÃO cadastra nem altera empresas (RLS só do gestor).
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
  ('00000000-0000-4000-8000-000000000091', 'gestor.lcn@niteroi.test'),
  ('00000000-0000-4000-8000-000000000092', 'licenciador@niteroi.test');
insert into servidores (user_id, nome, papel) values
  ('00000000-0000-4000-8000-000000000091', 'Gestor', 'gestor'),
  ('00000000-0000-4000-8000-000000000092', 'Licenciador', 'licenciador');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

set local role cadex_test_app;

create temp table ids (nome text primary key, id uuid);

-- Gestor prepara as empresas (executora e contratante de telecom).
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000091', true);
do $$
declare te uuid; op uuid;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores)
  values ('98765432000198', 'Executora Licenciador Ltda.', 'terceirizada', 'te@lcn.test', '{telecom}') returning id into te;
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('12345678000195', 'Operadora Licenciador S.A.', 'operadora', 'op@lcn.test') returning id into op;
  insert into ids values ('te', te), ('op', op);
end $$;

-- Agora como LICENCIADOR.
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000092', true);
do $$
declare te uuid := (select id from ids where nome = 'te');
        op uuid := (select id from ids where nome = 'op');
        lic uuid;
begin
  perform pg_temp.assert(public.is_licenciador(), 'is_licenciador deveria ser verdadeiro com aal2');

  -- Registra uma licença em execução (APTA não é mais exigida).
  lic := public.salvar_licenca(jsonb_build_object(
      'setor', 'telecom', 'processo_sei', 'NIT-050120/000700/2026', 'numero', 'LCN-1', 'tipos_obra', array['vala'],
      'escopo', 'Obra registrada pelo licenciador', 'executora_id', te, 'contratante_id', op,
      'protocolo_data', '2026-10-02', 'situacao', 'deferida', 'inicio_previsto', '2026-10-05', 'fim_previsto', '2026-11-05'),
    jsonb_build_array(jsonb_build_object('logradouro', 'Rua Teste', 'inicio_lat', -22.89, 'inicio_lng', -43.12)));
  perform pg_temp.assert((select situacao from licencas where id = lic) = 'deferida',
    'licenciador deveria conseguir registrar a licença');
  perform pg_temp.assert((select count(*) from licenca_trechos where licenca_id = lic) = 1,
    'o trecho da licença deveria ser gravado pelo licenciador');

  -- Mas NÃO pode cadastrar empresa...
  perform pg_temp.recusa(
    $q$insert into empresas (cnpj, razao_social, tipo, email) values ('11222333000181', 'Intrusa', 'operadora', 'x@x.test')$q$,
    null, 'licenciador cadastrou empresa');

  -- ...nem alterar uma empresa (RLS filtra a escrita: 0 linhas, sem erro).
  update empresas set razao_social = 'Alterada' where id = te;
  perform pg_temp.assert((select razao_social from empresas where id = te) = 'Executora Licenciador Ltda.',
    'licenciador não deveria conseguir alterar empresa');
end $$;

rollback;
