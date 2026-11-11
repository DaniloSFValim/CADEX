-- =====================================================================
-- Verificação pública de documento: documento de empresa de teste não é
-- confirmado; documento de empresa real continua sendo confirmado.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare
  emp_real uuid; emp_teste uuid; n int; quem uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (quem, 'emissor@t48.test');
  alter table empresas disable trigger user;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('11222333000181', 'Verificação Real Ltda.', 'operadora', 'vr@t48.test', '{telecom}', true, 'deferida', true, 'CADEX-T48-REAL')
  returning id into emp_real;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex, teste)
  values ('22333444000181', 'Verificação Teste Ltda.', 'operadora', 'vt@t48.test', '{telecom}', true, 'deferida', true, 'CADEX-T48-TESTE', true)
  returning id into emp_teste;

  -- Fixture direto (sem o fluxo de emissão, que exige gestor com verificação em duas etapas).
  alter table documentos_oficiais disable trigger user;
  insert into documentos_oficiais (tipo, numero, empresa_id, dados, emitido_por, emitido_em, codigo_verificacao)
  values ('certidao_regularidade', 1, emp_real, '{}'::jsonb, quem, now(), 'REAL0048AAAA'),
         ('certidao_regularidade', 2, emp_teste, '{}'::jsonb, quem, now(), 'TEST0048BBBB');
  alter table documentos_oficiais enable trigger user;

  select count(*) into n from public.verificar_documento('REAL0048AAAA');
  perform pg_temp.assert(n = 1, 'documento de empresa real deveria ser confirmado');
  select count(*) into n from public.verificar_documento('TEST0048BBBB');
  perform pg_temp.assert(n = 0, 'documento de empresa de teste foi confirmado publicamente');
end $$;

rollback;
