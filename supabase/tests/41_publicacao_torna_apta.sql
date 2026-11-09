-- =====================================================================
-- Publicação da portaria torna a empresa APTA, com validade de 12 meses.
-- A conferência de documentos obrigatórios continua valendo.
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
  when raise_exception or check_violation or not_null_violation then
    if sqlerrm like 'ASSERT%' then raise; end if;
    if position(p_trecho in sqlerrm) = 0 then
      raise exception 'ASSERT FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
    end if;
end;
$$;

do $$
declare com_docs uuid; sem_docs uuid; situacao_atual text; validade date;
begin
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('33000167000101', 'Publica Ltda.', 'operadora', 'p@pub41.test', '{telecom}', true, 'em_analise', true, 'CADEX-PUB-0041')
  returning id into com_docs;
  insert into empresas (cnpj, razao_social, tipo, email, setores, executa_obras, situacao, ativa, codigo_cadex)
  values ('24144040000175', 'Sem Docs Ltda.', 'operadora', 's@pub41.test', '{telecom}', true, 'em_analise', true, 'CADEX-PUB-0042')
  returning id into sem_docs;

  -- Documentos obrigatórios entregues para a primeira empresa.
  insert into documentos (empresa_id, tipo, status)
  select e.id, t.codigo, 'entregue' from empresas e join tipos_documento t
    on t.obrigatorio and public.perfil_documental(e.tipo, e.setores) = any(t.perfis)
   where e.id = com_docs;

  -- 1. Publicação gravada: vira APTA e ganha validade de 12 meses.
  update empresas set portaria_numero = 'Portaria SECONSER nº 41/2026', portaria_data = date '2026-09-20'
   where id = com_docs;
  select situacao, validade_ate into situacao_atual, validade from empresas where id = com_docs;
  perform pg_temp.assert(situacao_atual = 'apta', 'publicação não tornou a empresa APTA');
  perform pg_temp.assert(validade = date '2027-09-20', 'validade não são 12 meses a partir da publicação');

  -- 2. Com documentos pendentes, a publicação é recusada e nada muda.
  perform pg_temp.recusa(format($q$update empresas set portaria_numero = 'Portaria SECONSER nº 42/2026',
    portaria_data = date '2026-09-20' where id = %L$q$, sem_docs),
    'documentos obrigatórios', 'publicação foi aceita com documentos pendentes');
  select situacao into situacao_atual from empresas where id = sem_docs;
  perform pg_temp.assert(situacao_atual = 'em_analise', 'empresa mudou de situação após recusa');
end $$;

rollback;
