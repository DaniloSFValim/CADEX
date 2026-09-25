-- =====================================================================
-- Testes do cadastro de empresas, rodando sob RLS como usuário comum
-- (não superusuário), do mesmo jeito que o app grava.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

-- Dois usuários: um servidor e um logado sem ser servidor.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'servidor@niteroi.test'),
  ('00000000-0000-4000-8000-000000000002', 'outro@exemplo.test');
insert into servidores (user_id, nome) values
  ('00000000-0000-4000-8000-000000000001', 'Servidor Teste');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadex_test_app') then
    create role cadex_test_app nologin nosuperuser nobypassrls;
  end if;
end $$;
grant authenticated to cadex_test_app;

select pg_temp.assert((select count(*) from tipos_documento) = 15,
  'o art. 6º prevê 15 documentos');
select pg_temp.assert((select count(*) from tipos_documento where obrigatorio) = 12,
  'incisos I a III são obrigatórios; IV e V não');

-- ---------------------------------------------------------------------
-- Servidor: cadastra, edita, anexa documento
-- ---------------------------------------------------------------------
set local role cadex_test_app;
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000001', true);

do $$
declare op uuid; op2 uuid; te uuid; sub1 uuid; sub2 uuid; n int; cod text;
begin
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('11.222.333/0001-81', 'Operadora Teste S.A.', 'operadora', 'op@t.test')
  returning id, codigo_cadex into op, cod;
  perform pg_temp.assert((select cnpj from empresas where id = op) = '11222333000181',
    'CNPJ deveria ser gravado só com dígitos');
  perform pg_temp.assert(cod = 'CADEX-OPE-' || extract(year from current_date) || '-0001',
    'código da 1ª operadora deveria ser CADEX-OPE-<ano>-0001, veio ' || coalesce(cod, 'nulo'));

  insert into empresas (cnpj, razao_social, tipo, email)
  values ('55666777000181', 'Segunda Operadora S.A.', 'operadora', 'op2@t.test')
  returning id, codigo_cadex into op2, cod;
  perform pg_temp.assert(cod like 'CADEX-OPE-%-0002', 'numeração da operadora deveria seguir: ' || cod);

  insert into empresas (cnpj, razao_social, tipo, email)
  values ('22333444000181', 'Terceirizada Teste Ltda.', 'terceirizada', 'te@t.test')
  returning id, codigo_cadex into te, cod;
  perform pg_temp.assert(cod like 'CADEX-TER-%-0001',
    'terceirizada tem numeração própria, começando em 0001: ' || cod);

  -- A terceirizada atende as duas operadoras
  insert into vinculos (contratante_id, contratada_id) values (op, te), (op2, te);
  select count(*) into n from vinculos where contratada_id = te and fim is null;
  perform pg_temp.assert(n = 2, 'terceirizada deveria ter dois vínculos ativos');

  update vinculos set fim = current_date where contratante_id = op2 and contratada_id = te;
  select count(*) into n from vinculos where contratada_id = te and fim is null;
  perform pg_temp.assert(n = 1, 'encerrar vínculo deveria deixar um ativo');

  -- Operadora não pode ser contratada; ninguém contrata a si mesmo
  begin
    insert into vinculos (contratante_id, contratada_id) values (te, op);
    raise exception 'ASSERT FALHOU: vínculo com papéis trocados foi aceito';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;
  begin
    insert into vinculos (contratante_id, contratada_id) values (op, op2);
    raise exception 'ASSERT FALHOU: operadora vinculada como terceirizada';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;

  -- Subcontratação em qualquer grau (arts. 2º, VIII, e 3º, § 1º)
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('66777888000181', 'Subcontratada 1º grau Ltda.', 'terceirizada', 's1@t.test')
  returning id into sub1;
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('77888999000181', 'Subcontratada 2º grau Ltda.', 'terceirizada', 's2@t.test')
  returning id into sub2;
  insert into vinculos (contratante_id, contratada_id) values (te, sub1), (sub1, sub2);
  perform pg_temp.assert(
    (select codigo_cadex from empresas where id = sub2) like 'CADEX-TER-%',
    'subcontratada deveria ter código CADEX próprio');

  begin
    insert into vinculos (contratante_id, contratada_id) values (sub2, te);
    raise exception 'ASSERT FALHOU: ciclo indireto (te → sub1 → sub2 → te) foi aceito';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;
  begin
    insert into vinculos (contratante_id, contratada_id) values (sub1, te);
    raise exception 'ASSERT FALHOU: ciclo direto (te ↔ sub1) foi aceito';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;
  begin
    insert into vinculos (contratante_id, contratada_id) values (te, te);
    raise exception 'ASSERT FALHOU: empresa contratou a si mesma';
  exception when check_violation then null;
  end;

  update empresas set telefone = '(21) 99999-0000' where id = te;
  perform pg_temp.assert((select telefone from empresas where id = te) = '(21) 99999-0000',
    'servidor não conseguiu editar');

  -- Código, tipo e CNPJ são permanentes
  begin
    update empresas set codigo_cadex = 'CADEX-OPE-1999-9999' where id = op;
    raise exception 'ASSERT FALHOU: código CADEX foi alterado';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;
  begin
    update empresas set tipo = 'terceirizada' where id = op;
    raise exception 'ASSERT FALHOU: tipo da empresa foi alterado';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;
  begin
    update empresas set cnpj = '33444555000181' where id = op;
    raise exception 'ASSERT FALHOU: CNPJ foi alterado';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;

  -- Numeração não pode ser chamada nem mexida por fora
  begin
    perform proximo_codigo_cadex('operadora');
    raise exception 'ASSERT FALHOU: usuário gerou código CADEX por fora do cadastro';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from sequencias_cadex;
    raise exception 'ASSERT FALHOU: usuário leu a numeração';
  exception when insufficient_privilege then null;
  end;

  -- CNPJ inválido
  begin
    insert into empresas (cnpj, razao_social, tipo, email)
    values ('11222333000180', 'X', 'operadora', 'x@t.test');
    raise exception 'ASSERT FALHOU: CNPJ com dígito errado foi aceito';
  exception when check_violation then null;
  end;

  -- CNPJ repetido
  begin
    insert into empresas (cnpj, razao_social, tipo, email)
    values ('11222333000181', 'Duplicada', 'operadora', 'd@t.test');
    raise exception 'ASSERT FALHOU: CNPJ repetido foi aceito';
  exception when unique_violation then null;
  end;

  -- Documento com validade exige a data
  begin
    insert into documentos (empresa_id, tipo, arquivo, nome_arquivo)
    values (op, 'CND_FEDERAL', op || '/cnd.pdf', 'cnd.pdf');
    raise exception 'ASSERT FALHOU: certidão sem validade foi aceita';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;

  -- Arquivo fora da pasta da empresa
  begin
    insert into documentos (empresa_id, tipo, arquivo, nome_arquivo)
    values (op, 'CNPJ_CARD', te || '/cartao.pdf', 'cartao.pdf');
    raise exception 'ASSERT FALHOU: arquivo de outra empresa foi aceito';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;

  insert into documentos (empresa_id, tipo, arquivo, nome_arquivo, validade)
  values (op, 'CND_FEDERAL', op || '/cnd.pdf', 'cnd.pdf', current_date + 90);
  select count(*) into n from documentos where empresa_id = op;
  perform pg_temp.assert(n = 1, 'servidor não conseguiu anexar documento');
  perform pg_temp.assert(
    (select enviado_por from documentos where empresa_id = op)
      = '00000000-0000-4000-8000-000000000001',
    'documento deveria registrar quem enviou');

  -- Servidor não se promove nem cria outro servidor
  begin
    insert into servidores (user_id, nome)
    values ('00000000-0000-4000-8000-000000000002', 'Promovido');
    raise exception 'ASSERT FALHOU: servidor cadastrou outro servidor pelo app';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Logado sem ser servidor: não vê nem grava nada
-- ---------------------------------------------------------------------
select set_config('cadex.test_user_id', '00000000-0000-4000-8000-000000000002', true);

do $$
begin
  perform pg_temp.assert((select count(*) from empresas) = 0,
    'VAZAMENTO: não servidor enxergou empresas');
  perform pg_temp.assert((select count(*) from documentos) = 0,
    'VAZAMENTO: não servidor enxergou documentos');
  perform pg_temp.assert((select count(*) from vinculos) = 0,
    'VAZAMENTO: não servidor enxergou vínculos');

  begin
    insert into empresas (cnpj, razao_social, tipo, email)
    values ('44555666000181', 'Intrusa', 'operadora', 'i@t.test');
    raise exception 'ASSERT FALHOU: não servidor cadastrou empresa';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into servidores (user_id, nome)
    values ('00000000-0000-4000-8000-000000000002', 'Eu mesmo');
    raise exception 'ASSERT FALHOU: usuário se promoveu a servidor';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Visitante sem login: nenhuma tabela acessível
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('cadex.test_user_id', '', true);

do $$
begin
  begin
    perform count(*) from empresas;
    raise exception 'ASSERT FALHOU: visitante leu empresas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from documentos;
    raise exception 'ASSERT FALHOU: visitante leu documentos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from vinculos;
    raise exception 'ASSERT FALHOU: visitante leu vínculos';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
