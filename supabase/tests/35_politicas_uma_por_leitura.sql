-- =====================================================================
-- Desempenho: cada tabela tem uma única política que vale para SELECT
-- (antes, *_gravar (FOR ALL) somava-se a *_ler em toda leitura).
-- =====================================================================
begin;

create or replace function pg_temp.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'ASSERT FALHOU: %', p_msg; end if;
end;
$$;

do $$
declare r record;
begin
  for r in
    select tablename, count(*) as n
      from pg_policies
     where schemaname = 'public'
       and tablename in ('funcionarios','intervencoes_sem_licenca','licenca_trechos','licencas',
                         'orgaos_publicos','responsaveis_tecnicos','veiculos','vinculos')
       and (cmd = 'ALL' or cmd = 'SELECT')
     group by tablename
  loop
    perform pg_temp.assert(r.n = 1, 'tabela ' || r.tablename || ' deveria ter uma só política de leitura');
  end loop;
  perform pg_temp.assert(
    (select count(*) from pg_policies where schemaname='public' and tablename='servidores' and policyname='servidores_propria') = 1,
    'servidores_propria deve existir');
end $$;

rollback;
