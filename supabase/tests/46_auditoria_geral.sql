-- =====================================================================
-- Auditoria geral: o visitante lê os tipos de obra ativos (sem 401), e
-- o número de empresas dos indicadores públicos bate com a consulta.
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;
grant execute on function pg_temp.assert(boolean, text) to anon;

-- Um tipo desativado, para conferir que o visitante não o vê.
update public.tipos_intervencao set ativo = false
 where id = (select id from public.tipos_intervencao where setor <> 'telecom' and codigo <> 'outros' order by id limit 1);

-- Visitante: a leitura não pode falhar por causa de função que ele não executa.
set local role anon;
do $$
declare n int; inativos int;
begin
  select count(*), count(*) filter (where not ativo) into n, inativos from public.tipos_intervencao;
  perform pg_temp.assert(n > 0, 'visitante deveria ler os tipos de obra ativos');
  perform pg_temp.assert(inativos = 0, 'visitante leu tipo de obra desativado');
end $$;
reset role;

-- Indicador de empresas = quantidade de empresas que a consulta pública lista.
do $$
begin
  perform pg_temp.assert(
    (public.estatisticas_publicas()->>'empresas_ativas')::int = (select count(*) from public.consulta_publica()),
    'empresas dos indicadores públicos não bate com a consulta pública');
end $$;

-- As políticas reescritas continuam com a mesma regra.
do $$
begin
  perform pg_temp.assert(
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tipos_intervencao'
        and cmd = 'SELECT' and 'anon' = any (roles) and qual !~ 'is_servidor') = 1,
    'a política de leitura do visitante não pode chamar is_servidor()');
end $$;

rollback;
