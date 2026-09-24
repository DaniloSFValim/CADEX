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
declare op uuid; te uuid; n int;
begin
  insert into empresas (cnpj, razao_social, tipo, email)
  values ('11.222.333/0001-81', 'Operadora Teste S.A.', 'operadora', 'op@t.test')
  returning id into op;
  perform pg_temp.assert((select cnpj from empresas where id = op) = '11222333000181',
    'CNPJ deveria ser gravado só com dígitos');

  insert into empresas (cnpj, razao_social, tipo, operadora_id, email)
  values ('22333444000181', 'Terceirizada Teste Ltda.', 'terceirizada', op, 'te@t.test')
  returning id into te;

  update empresas set telefone = '(21) 99999-0000', situacao = 'inativa' where id = te;
  perform pg_temp.assert((select situacao from empresas where id = te) = 'inativa',
    'servidor não conseguiu editar');

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

  -- Terceirizada sem operadora
  begin
    insert into empresas (cnpj, razao_social, tipo, email)
    values ('33444555000181', 'Solta', 'terceirizada', 's@t.test');
    raise exception 'ASSERT FALHOU: terceirizada sem operadora foi aceita';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
  end;

  -- Terceirizada contratada por outra terceirizada
  begin
    insert into empresas (cnpj, razao_social, tipo, operadora_id, email)
    values ('33444555000181', 'Cascata', 'terceirizada', te, 'c@t.test');
    raise exception 'ASSERT FALHOU: terceirizada de terceirizada foi aceita';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
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
end $$;

reset role;
rollback;
