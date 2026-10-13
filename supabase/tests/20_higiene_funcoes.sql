-- =====================================================================
-- Higiene de funções: gatilho sem EXECUTE para anônimo e logado, search_path
-- fixo nas duas funções de gatilho e a sonda de teste removida.
-- =====================================================================
begin;

do $$
declare cfg text[];
begin
  if has_function_privilege('anon', 'public.licencas_exige_autoexecucao_habilitada()', 'execute')
     or has_function_privilege('authenticated', 'public.licencas_exige_autoexecucao_habilitada()', 'execute') then
    raise exception 'ASSERT FALHOU: a função do gatilho de execução própria ainda é chamável';
  end if;

  select proconfig into cfg from pg_proc where proname = 'empresas_situacao' and pronamespace = 'public'::regnamespace;
  if not (coalesce(cfg, '{}') @> array['search_path=public']) then
    raise exception 'ASSERT FALHOU: empresas_situacao sem search_path fixo (%)', cfg;
  end if;
  select proconfig into cfg from pg_proc where proname = 'vinculos_antes_de_gravar' and pronamespace = 'public'::regnamespace;
  if not (coalesce(cfg, '{}') @> array['search_path=public']) then
    raise exception 'ASSERT FALHOU: vinculos_antes_de_gravar sem search_path fixo (%)', cfg;
  end if;

  if exists (select 1 from pg_proc where proname = 'zzz_probe_rowtype' and pronamespace = 'public'::regnamespace) then
    raise exception 'ASSERT FALHOU: a sonda de teste ainda existe';
  end if;
end $$;

-- Os gatilhos continuam funcionando sem o EXECUTE: o cadastro de vínculo e a situação da empresa seguem as regras.
do $$
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores) values ('12345678000195', 'Op Higiene S.A.', 'operadora', 'h@h.test', '{telecom}');
  begin
    insert into vinculos (contratante_id, contratada_id)
    select id, id from empresas where cnpj = '12345678000195';
    raise exception 'ASSERT FALHOU: vínculo de operadora como contratada foi aceito';
  exception when raise_exception then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if position('terceirizada' in sqlerrm) = 0 then raise exception 'ASSERT FALHOU: erro inesperado: %', sqlerrm; end if;
  end;
end $$;

rollback;
