-- =====================================================================
-- Correção em lote: só administrador; sem administrador, nada é gravado.
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
  v_ok boolean;
begin
  perform pg_temp.assert(
    (select prosecdef from pg_proc where proname = 'admin_corrigir_licencas' and pronamespace = 'public'::regnamespace),
    'admin_corrigir_licencas deve ser SECURITY DEFINER');
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.admin_corrigir_licencas(jsonb)', 'execute'),
    'anon não pode executar a correção em lote');
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.admin_corrigir_licencas(jsonb)', 'execute'),
    'authenticated precisa poder chamar (a própria função confere o administrador)');

  -- Sem sessão de administrador, a chamada é recusada.
  begin
    perform public.admin_corrigir_licencas('[{"id":"00000000-0000-0000-0000-000000000000","numero":"001/2026"}]'::jsonb);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'Só o administrador%';
  end;
  perform pg_temp.assert(v_ok, 'sem administrador a correção deve ser recusada com a mensagem de permissão');
end $$;

rollback;
