-- =====================================================================
-- Situação da inscrição (arts. 7º e 8º), perfis gestor e CISP,
-- pessoal e veículos (arts. 6º, 19, 21, 23) e consulta pública (art. 7º, § 2º)
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
  execute p_sql;
  raise exception 'ASSERT FALHOU: %', p_msg;
exception
  when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  when check_violation or insufficient_privilege then null;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'gestor@niteroi.test'),
  ('00000000-0000-4000-8000-000000000013', 'cisp@niteroi.test');
insert into servidores (user_id, nome, papel) values
  ('00000000-0000-4000-8000-000000000011', 'Gestora SECONSER', 'gestor'),
  ('00000000-0000-4000-8000-000000000013', 'Operador CISP', 'cisp');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select, insert on ids to cadex_test_app;

-- ---------------------------------------------------------------------
-- Gestor
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000011', true);

do $$
declare op uuid; op2 uuid; te uuid; n int;
begin
  insert into empresas (cnpj, razao_social, nome_fantasia, tipo, email, processo_numero, data_requerimento)
  values ('11222333000181', 'Operadora Teste S.A.', 'OpTeste', 'operadora', 'op@t.test', '9900/000123/2026', current_date)
  returning id into op;
  insert into ids values ('op', op);
  perform pg_temp.assert((select situacao from empresas where id = op) = 'em_analise',
    'requerimento novo deveria nascer EM ANÁLISE');
  perform pg_temp.assert((select count(*) from historico_situacao where empresa_id = op) = 1,
    'cadastro deveria abrir o histórico');

  -- APTA exige a portaria
  perform pg_temp.recusa(format($q$update empresas set situacao = 'apta' where id = %L$q$, op),
    'APTA sem portaria foi aceita');
  update empresas set situacao = 'apta', portaria_numero = 'Portaria SECONSER nº 12/2026',
         portaria_data = date '2026-09-20' where id = op;
  perform pg_temp.assert((select validade_ate from empresas where id = op) = date '2027-09-20',
    'validade deveria ser de 12 meses a partir da publicação (art. 7º, § 1º)');

  -- Indeferir só o que está em análise; inapta só depois do saneamento
  perform pg_temp.recusa(format($q$update empresas set situacao = 'indeferida' where id = %L$q$, op),
    'empresa APTA foi indeferida');
  perform pg_temp.recusa(format($q$update empresas set situacao = 'inapta' where id = %L$q$, op),
    'APTA virou INAPTA sem notificação (art. 8º)');

  perform pg_temp.recusa(format($q$update empresas set situacao = 'em_saneamento' where id = %L$q$, op),
    'saneamento sem data de notificação foi aceito');
  update empresas set situacao = 'em_saneamento', notificacao_data = current_date where id = op;
  perform pg_temp.recusa(format($q$update empresas set situacao = 'inapta' where id = %L$q$, op),
    'INAPTA antes dos 30 dias de saneamento (art. 8º, § 1º)');

  update empresas set notificacao_data = current_date - 31 where id = op;
  update empresas set situacao = 'inapta' where id = op;
  perform pg_temp.assert((select situacao from empresas where id = op) = 'inapta',
    'deveria virar INAPTA após 30 dias');

  -- Restabelecimento (art. 8º, § 3º)
  update empresas set situacao = 'apta' where id = op;
  perform pg_temp.assert((select notificacao_data from empresas where id = op) is null,
    'restabelecer deveria encerrar a notificação');
  perform pg_temp.assert((select count(*) from historico_situacao where empresa_id = op) = 5,
    'histórico deveria ter 5 registros (cadastro, apta, saneamento, inapta, apta), tem ' || (select count(*) from historico_situacao where empresa_id = op));

  -- Terceirizada indeferida
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('22333444000181', 'Terceirizada Teste Ltda.', 'terceirizada', 'te@t.test')
  returning id into te;
  insert into ids values ('te', te);
  insert into vinculos (contratante_id, contratada_id) values (op, te);
  update empresas set situacao = 'indeferida' where id = te;

  -- Operadora com inscrição vencida
  insert into empresas (cnpj, razao_social, tipo, email, situacao, portaria_numero, portaria_data)
  values ('55666777000181', 'Operadora Vencida S.A.', 'operadora', 'v@t.test',
          'apta', 'Portaria antiga', current_date - 400)
  returning id into op2;
  insert into ids values ('op2', op2);

  -- Responsável técnico: CPF conferido
  perform pg_temp.recusa(format($q$insert into responsaveis_tecnicos (empresa_id, nome, cpf, conselho, registro_numero)
    values (%L, 'Fulano', '52998224724', 'CREA', '123')$q$, op), 'CPF inválido foi aceito');
  insert into responsaveis_tecnicos (empresa_id, nome, cpf, conselho, registro_numero, registro_uf, art_rrt_numero)
  values (op, 'Engenheira Responsável', '52998224725', 'CREA', 'RJ-123456', 'RJ', 'ART 2026/000001');

  -- Pessoal (crachá, art. 23)
  insert into funcionarios (empresa_id, nome, documento_tipo, documento_numero, funcao, cracha_validade, telefone, responsavel_equipe)
  values (te, 'Técnico de Campo', 'RG', '12.345.678-9', 'Cabista', current_date + 180, '(21) 98888-7777', true);

  -- Veículos (arts. 19 e 21)
  insert into veiculos (empresa_id, tipo, placa, identificacao_laterais, identificacao_traseira, concessionaria_traseira_id)
  values (te, 'Caminhão cesto aéreo', 'abc-1d23', true, true, op);
  perform pg_temp.assert((select placa from veiculos where empresa_id = te) = 'ABC1D23',
    'placa deveria ser normalizada');
  perform pg_temp.recusa(format($q$insert into veiculos (empresa_id, tipo, placa) values (%L, 'Van', 'XYZ')$q$, te),
    'placa inválida foi aceita');
  perform pg_temp.recusa(format($q$insert into veiculos (empresa_id, tipo) values (%L, 'Van')$q$, te),
    'veículo sem placa foi aceito');
  insert into veiculos (empresa_id, categoria, tipo) values (te, 'maquinario', 'Retroescavadeira');
  perform pg_temp.recusa(format($q$insert into veiculos (empresa_id, tipo, placa, concessionaria_traseira_id)
    values (%L, 'Van', 'DEF1234', %L)$q$, te, te), 'terceirizada indicada como concessionária na traseira');

  -- Logo: só dentro da pasta da própria empresa
  update empresas set logo_arquivo = op || '/logo-1.png' where id = op;
  perform pg_temp.recusa(format($q$update empresas set logo_arquivo = %L where id = %L$q$, te || '/logo.png', op),
    'logo apontando para a pasta de outra empresa foi aceito');

  -- Um documento, para provar que o CISP não o vê
  insert into documentos (empresa_id, tipo, arquivo, nome_arquivo)
  values (op, 'CNPJ_CARD', op || '/cartao.pdf', 'cartao.pdf');
end $$;

-- ---------------------------------------------------------------------
-- CISP: lê o operacional, não grava nada, não vê documentos
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000013', true);

do $$
declare op uuid := (select v from ids where k = 'op'); te uuid := (select v from ids where k = 'te'); n int;
begin
  perform pg_temp.assert((select count(*) from empresas) = 3, 'CISP deveria ver as empresas');
  perform pg_temp.assert((select count(*) from responsaveis_tecnicos) = 1, 'CISP deveria ver o responsável técnico');
  perform pg_temp.assert((select count(*) from funcionarios) = 1, 'CISP deveria ver o pessoal');
  perform pg_temp.assert((select count(*) from veiculos) = 2, 'CISP deveria ver os veículos');
  perform pg_temp.assert((select count(*) from vinculos) = 1, 'CISP deveria ver os vínculos');
  perform pg_temp.assert((select count(*) from historico_situacao) > 0, 'CISP deveria ver o histórico');
  perform pg_temp.assert((select count(*) from documentos) = 0, 'VAZAMENTO: CISP viu documentos');

  perform pg_temp.recusa($q$insert into empresas (cnpj, razao_social, tipo, email)
    values ('33444555000181', 'X', 'operadora', 'x@t.test')$q$, 'CISP cadastrou empresa');
  perform pg_temp.recusa(format($q$insert into funcionarios (empresa_id, nome, documento_tipo, documento_numero, funcao)
    values (%L, 'X', 'RG', '1', 'X')$q$, te), 'CISP cadastrou funcionário');
  perform pg_temp.recusa(format($q$insert into veiculos (empresa_id, tipo, placa) values (%L, 'Van', 'GHI1234')$q$, te),
    'CISP cadastrou veículo');

  update empresas set situacao = 'inapta', razao_social = 'Alterada' where id = op;
  perform pg_temp.assert((select razao_social from empresas where id = op) = 'Operadora Teste S.A.',
    'CISP alterou empresa');
  delete from veiculos;
  perform pg_temp.assert((select count(*) from veiculos) = 2, 'CISP apagou veículo');
end $$;

-- ---------------------------------------------------------------------
-- Consulta pública: só dados da pessoa jurídica e da inscrição
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('cadex.test_user_id', '', true);

do $$
declare r record; cols text;
begin
  perform pg_temp.assert((select count(*) from consulta_publica()) = 3, 'consulta pública deveria listar as 3 empresas');

  select * into r from consulta_publica() where cnpj = '11222333000181';
  perform pg_temp.assert(r.situacao = 'apta' and r.codigo_cadex like 'CADEX-OPE-%'
    and r.portaria_numero = 'Portaria SECONSER nº 12/2026', 'operadora deveria aparecer APTA com a portaria');
  perform pg_temp.assert(r.logo_arquivo like '%/logo-1.png', 'consulta pública deveria trazer o logo');

  select * into r from consulta_publica() where cnpj = '22333444000181';
  perform pg_temp.assert(r.situacao = 'indeferida' and r.contratantes = array['OpTeste'],
    'terceirizada deveria aparecer INDEFERIDA, atendendo a OpTeste');

  select * into r from consulta_publica() where cnpj = '55666777000181';
  perform pg_temp.assert(r.situacao = 'vencida', 'inscrição com mais de 12 meses deveria aparecer VENCIDA');

  -- Nenhum dado de contato, pessoa ou documento na consulta
  select string_agg(a.attname, ',') into cols
    from pg_proc p, unnest(p.proargnames) a(attname)
   where p.proname = 'consulta_publica';
  perform pg_temp.assert(cols !~ '(email|telefone|logradouro|cpf|nome\b|placa)',
    'consulta pública expõe dado pessoal ou de contato: ' || cols);

  perform pg_temp.recusa('select count(*) from responsaveis_tecnicos', 'visitante leu responsáveis técnicos');
  perform pg_temp.recusa('select count(*) from funcionarios', 'visitante leu funcionários');
  perform pg_temp.recusa('select count(*) from veiculos', 'visitante leu veículos');
  perform pg_temp.recusa('select count(*) from historico_situacao', 'visitante leu o histórico');
end $$;

reset role;
rollback;
