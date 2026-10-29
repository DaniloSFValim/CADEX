-- =====================================================================
-- Histórico da situação não é dado público: a função que o expunha saiu do banco,
-- então nenhum anônimo consegue chamá-la pela API.
-- =====================================================================
begin;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'licenca_publica_historico') then
    raise exception 'ASSERT FALHOU: licenca_publica_historico ainda existe no banco';
  end if;
end $$;

rollback;
